// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Underwater position liquidation: repay vault debt, seize collateral, optional spot swap.
module leverx::liquidation;

use deepbook::pool::Pool;
use deepbook_predict::{
    market_key::MarketKey,
    oracle::OracleSVI,
    predict::Predict,
    predict_manager::PredictManager,
    range_key::RangeKey,
};
use leverx::{
    user_proxy::UserProxy,
    protocol_constants,
    errors,
    events,
    fee_collector::{Self, FeeCollector},
    ltv,
    predict_client,
    protocol_registry::{Self, LeverxRegistry},
    spot_swap,
    leverage_vault::{Self as vault_mod, LeverageVault},
};
use pyth::price_info::PriceInfoObject;
use std::type_name;
use sui::{clock::Clock, coin::{Self, Coin}};
use token::deep::DEEP;

/// Atomic keeper path: redeem live position, repay debt, seize collateral, swap to quote.
public fun flash_liquidate_with_spot_swap_and_redeem<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    predict_oracle: &OracleSVI,
    key: MarketKey,
    position_qty: u64,
    spot_pool: &mut Pool<CollateralAsset, Quote>,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    fee_deep: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<DEEP>) {
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let had_redeem = position_qty > 0;
    if (had_redeem) {
        predict_client::redeem_binary_and_credit_key<Quote>(
            predict,
            manager,
            predict_oracle,
            key,
            position_qty,
            proxy,
            clock,
            ctx,
        );
    };

    let (mut quote_left, seized, debt, health) = flash_liquidate_binary_internal<Quote, CollateralAsset>(
        registry,
        vault,
        collector,
        proxy,
        key,
        collateral_oracle,
        quote_oracle,
        flash_loan_payment,
        clock,
        ctx,
    );

    let collateral_seized = seized.value();
    if (collateral_seized > 0) {
        assert_liquidation_swap_pool<CollateralAsset, Quote>(registry, spot_pool);
        let (mut base_left, mut quote_out, deep_left) = spot_swap::swap_collateral_coin(
            spot_pool,
            seized,
            fee_deep,
            min_quote_out,
            clock,
            ctx,
        );
        if (base_left.value() == 0) {
            coin::destroy_zero(base_left);
        } else {
            transfer::public_transfer(base_left, ctx.sender());
        };
        let quote_from_swap = quote_out.value();
        skim_protocol_fee<Quote>(vault, collector, object::id(proxy), &mut quote_out, ctx);
        quote_left.join(quote_out);
        emit_liquidation<CollateralAsset>(
            proxy,
            key,
            debt,
            collateral_seized,
            quote_from_swap,
            quote_left.value(),
            health,
            had_redeem,
            ctx,
        );
        (quote_left, deep_left)
    } else {
        coin::destroy_zero(seized);
        emit_liquidation<CollateralAsset>(proxy, key, debt, 0, 0, quote_left.value(), health, had_redeem, ctx);
        (quote_left, fee_deep)
    }
}

/// Permissionless keeper path: redeem live position, repay debt, seize collateral (no spot swap).
public fun flash_liquidate_with_redeem_permissionless<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    predict_oracle: &OracleSVI,
    key: MarketKey,
    position_qty: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<CollateralAsset>) {
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let had_redeem = position_qty > 0;
    if (had_redeem) {
        predict_client::redeem_binary_and_credit_key<Quote>(
            predict,
            manager,
            predict_oracle,
            key,
            position_qty,
            proxy,
            clock,
            ctx,
        );
    };

    let (payment, seized, debt, health) = flash_liquidate_binary_internal<Quote, CollateralAsset>(
        registry,
        vault,
        collector,
        proxy,
        key,
        collateral_oracle,
        quote_oracle,
        flash_loan_payment,
        clock,
        ctx,
    );
    emit_liquidation<CollateralAsset>(
        proxy,
        key,
        debt,
        seized.value(),
        0,
        payment.value(),
        health,
        had_redeem,
        ctx,
    );
    (payment, seized)
}

/// Core liquidation: verify health, repay key debt, seize key collateral.
fun flash_liquidate_binary_internal<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<CollateralAsset>, u64, u64) {
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    proxy.cancel_binary_limit_mint_for_liquidation(key, ctx);
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.binary_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let collateral_amount = proxy.binary_collateral_balance<CollateralAsset>(key);
    let quote_balance = proxy.binary_quote_balance(key);
    assert!(debt > 0, errors::not_liquidatable());
    assert!(collateral_amount > 0, errors::liquidation_no_collateral());
    let liq_max_age = protocol_registry::liquidation_pyth_max_age_secs(registry);
    let health = ltv::evaluate_account_health_with_max_age<CollateralAsset, Quote>(
        registry,
        collateral_amount,
        quote_balance,
        debt,
        collateral_oracle,
        quote_oracle,
        liq_max_age,
        clock,
    );
    assert!(
        ltv::is_liquidatable_with_max_age<CollateralAsset, Quote>(
            registry,
            collateral_amount,
            quote_balance,
            debt,
            collateral_oracle,
            quote_oracle,
            liq_max_age,
            clock,
        ),
        errors::not_liquidatable(),
    );

    let mut payment = merge_binary_key_quote_into_payment(proxy, key, flash_loan_payment, ctx);
    assert!(payment.value() >= debt, errors::insufficient_repayment());

    let repay_coin = payment.split(debt, ctx);
    fee_collector::repay_vault_for_ledger_principal(
        vault,
        collector,
        repay_coin,
        ledger_principal,
        protocol_constants::fee_source_interest(),
        clock,
        ctx,
    );
    proxy.record_repay_for_binary(key, ledger_principal);
    events::emit_vault_repaid(
        object::id(vault),
        object::id(proxy),
        proxy.owner(),
        debt,
        vault_mod::total_borrowed(vault),
        vault_mod::utilization_bps(vault),
        vault_mod::current_borrow_rate(vault),
        vault_mod::current_lp_apr_bps(vault),
    );
    events::emit_debt_repaid(object::id(proxy), proxy.owner(), debt, proxy.borrowed_quote());

    let seized = proxy.seize_binary_collateral<CollateralAsset>(key, ctx);
    (payment, seized, debt, health)
}

/// Permissionless keeper path for range keys: redeem, repay debt, seize collateral (no spot swap).
public fun flash_liquidate_range_with_redeem_permissionless<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    predict_oracle: &OracleSVI,
    key: RangeKey,
    position_qty: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<CollateralAsset>) {
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let had_redeem = position_qty > 0;
    if (had_redeem) {
        predict_client::redeem_range_and_credit_key<Quote>(
            predict,
            manager,
            predict_oracle,
            key,
            position_qty,
            proxy,
            clock,
            ctx,
        );
    };

    let (payment, seized, debt, health) = flash_liquidate_range_internal<Quote, CollateralAsset>(
        registry,
        vault,
        collector,
        proxy,
        key,
        collateral_oracle,
        quote_oracle,
        flash_loan_payment,
        clock,
        ctx,
    );
    emit_range_liquidation<CollateralAsset>(
        proxy,
        key,
        debt,
        seized.value(),
        0,
        payment.value(),
        health,
        had_redeem,
        ctx,
    );
    (payment, seized)
}

/// Atomic keeper path for range keys: redeem live position, repay debt, seize collateral, swap to quote.
public fun flash_liquidate_range_with_spot_swap_and_redeem<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    predict_oracle: &OracleSVI,
    key: RangeKey,
    position_qty: u64,
    spot_pool: &mut Pool<CollateralAsset, Quote>,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    fee_deep: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<DEEP>) {
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());

    let had_redeem = position_qty > 0;
    if (had_redeem) {
        predict_client::redeem_range_and_credit_key<Quote>(
            predict,
            manager,
            predict_oracle,
            key,
            position_qty,
            proxy,
            clock,
            ctx,
        );
    };

    let (mut quote_left, seized, debt, health) = flash_liquidate_range_internal<Quote, CollateralAsset>(
        registry,
        vault,
        collector,
        proxy,
        key,
        collateral_oracle,
        quote_oracle,
        flash_loan_payment,
        clock,
        ctx,
    );

    let collateral_seized = seized.value();
    if (collateral_seized > 0) {
        assert_liquidation_swap_pool<CollateralAsset, Quote>(registry, spot_pool);
        let (base_left, mut quote_out, deep_left) = spot_swap::swap_collateral_coin(
            spot_pool,
            seized,
            fee_deep,
            min_quote_out,
            clock,
            ctx,
        );
        if (base_left.value() == 0) {
            coin::destroy_zero(base_left);
        } else {
            transfer::public_transfer(base_left, ctx.sender());
        };
        let quote_from_swap = quote_out.value();
        skim_protocol_fee<Quote>(vault, collector, object::id(proxy), &mut quote_out, ctx);
        quote_left.join(quote_out);
        emit_range_liquidation<CollateralAsset>(
            proxy,
            key,
            debt,
            collateral_seized,
            quote_from_swap,
            quote_left.value(),
            health,
            had_redeem,
            ctx,
        );
        (quote_left, deep_left)
    } else {
        coin::destroy_zero(seized);
        emit_range_liquidation<CollateralAsset>(
            proxy,
            key,
            debt,
            0,
            0,
            quote_left.value(),
            health,
            had_redeem,
            ctx,
        );
        (quote_left, fee_deep)
    }
}

fun flash_liquidate_range_internal<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: RangeKey,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<CollateralAsset>, u64, u64) {
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    proxy.cancel_range_limit_mint_for_liquidation(key, ctx);
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.range_borrowed_quote(key);
    let debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let collateral_amount = proxy.range_collateral_balance<CollateralAsset>(key);
    let quote_balance = proxy.range_quote_balance(key);
    assert!(debt > 0, errors::not_liquidatable());
    assert!(collateral_amount > 0, errors::liquidation_no_collateral());
    let liq_max_age = protocol_registry::liquidation_pyth_max_age_secs(registry);
    let health = ltv::evaluate_account_health_with_max_age<CollateralAsset, Quote>(
        registry,
        collateral_amount,
        quote_balance,
        debt,
        collateral_oracle,
        quote_oracle,
        liq_max_age,
        clock,
    );
    assert!(
        ltv::is_liquidatable_with_max_age<CollateralAsset, Quote>(
            registry,
            collateral_amount,
            quote_balance,
            debt,
            collateral_oracle,
            quote_oracle,
            liq_max_age,
            clock,
        ),
        errors::not_liquidatable(),
    );

    let mut payment = merge_range_key_quote_into_payment(proxy, key, flash_loan_payment, ctx);
    assert!(payment.value() >= debt, errors::insufficient_repayment());

    let repay_coin = payment.split(debt, ctx);
    fee_collector::repay_vault_for_ledger_principal(
        vault,
        collector,
        repay_coin,
        ledger_principal,
        protocol_constants::fee_source_interest(),
        clock,
        ctx,
    );
    proxy.record_repay_for_range(key, ledger_principal);
    events::emit_vault_repaid(
        object::id(vault),
        object::id(proxy),
        proxy.owner(),
        debt,
        vault_mod::total_borrowed(vault),
        vault_mod::utilization_bps(vault),
        vault_mod::current_borrow_rate(vault),
        vault_mod::current_lp_apr_bps(vault),
    );
    events::emit_debt_repaid(object::id(proxy), proxy.owner(), debt, proxy.borrowed_quote());

    let seized = proxy.seize_range_collateral<CollateralAsset>(key, ctx);
    (payment, seized, debt, health)
}

fun assert_liquidation_swap_pool<CollateralAsset, Quote>(
    registry: &LeverxRegistry,
    spot_pool: &Pool<CollateralAsset, Quote>,
) {
    assert!(
        type_name::with_defining_ids<CollateralAsset>() != type_name::with_defining_ids<Quote>(),
        errors::same_asset_swap(),
    );
    assert!(
        spot_pool.id() == protocol_registry::swap_pool_id<CollateralAsset>(registry),
        errors::invalid_swap_pool(),
    );
}

fun merge_binary_key_quote_into_payment<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    mut payment: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<Quote> {
    let key_quote = proxy.binary_quote_balance(key);
    if (key_quote > 0) {
        let key_coin = proxy.withdraw_quote_from_binary<Quote>(key, key_quote, ctx);
        payment.join(key_coin);
    };
    payment
}

fun merge_range_key_quote_into_payment<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    mut payment: Coin<Quote>,
    ctx: &mut TxContext,
): Coin<Quote> {
    let key_quote = proxy.range_quote_balance(key);
    if (key_quote > 0) {
        let key_coin = proxy.withdraw_quote_from_range<Quote>(key, key_quote, ctx);
        payment.join(key_coin);
    };
    payment
}

/// Skim a bps slice of swap proceeds and split 80% vault / 10% collector / 10% keeper.
fun skim_protocol_fee<Quote>(
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    account_id: ID,
    quote_out: &mut Coin<Quote>,
    ctx: &mut TxContext,
) {
    let skim_bps = protocol_constants::default_liquidation_insurance_bps();
    let skim_amt = ltv::mul_bps(quote_out.value(), skim_bps);
    if (skim_amt > 0 && skim_amt < quote_out.value()) {
        let skim = quote_out.split(skim_amt, ctx);
        fee_collector::collect_protocol_skim(
            vault,
            collector,
            skim,
            protocol_constants::fee_source_liquidation(),
            ctx,
        );
        events::emit_insurance_fund_skimmed(
            object::id(vault),
            account_id,
            skim_amt,
            events::liquidation_skim_source(),
        );
    };
}

/// Emit a `PositionLiquidated` event with debt, seize, swap, and health details.
fun emit_liquidation<CollateralAsset>(
    proxy: &UserProxy,
    key: MarketKey,
    debt_repaid: u64,
    collateral_seized: u64,
    quote_from_swap: u64,
    surplus_quote: u64,
    health_bps: u64,
    had_position_redeem: bool,
    ctx: &TxContext,
) {
    events::emit_position_liquidated(
        object::id(proxy),
        proxy.owner(),
        ctx.sender(),
        key.oracle_id(),
        key.expiry(),
        key.strike(),
        0,
        key.is_up(),
        false,
        std::type_name::with_defining_ids<CollateralAsset>(),
        debt_repaid,
        collateral_seized,
        quote_from_swap,
        surplus_quote,
        health_bps,
        had_position_redeem,
    );
}

/// Emit a range `PositionLiquidated` event.
fun emit_range_liquidation<CollateralAsset>(
    proxy: &UserProxy,
    key: RangeKey,
    debt_repaid: u64,
    collateral_seized: u64,
    quote_from_swap: u64,
    surplus_quote: u64,
    health_bps: u64,
    had_position_redeem: bool,
    ctx: &TxContext,
) {
    events::emit_position_liquidated(
        object::id(proxy),
        proxy.owner(),
        ctx.sender(),
        key.oracle_id(),
        key.expiry(),
        key.lower_strike(),
        key.higher_strike(),
        false,
        true,
        std::type_name::with_defining_ids<CollateralAsset>(),
        debt_repaid,
        collateral_seized,
        quote_from_swap,
        surplus_quote,
        health_bps,
        had_position_redeem,
    );
}
