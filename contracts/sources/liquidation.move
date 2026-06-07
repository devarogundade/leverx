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
};
use leverx::{
    user_proxy::UserProxy,
    protocol_constants,
    errors,
    events,
    fee_collector::{Self, FeeCollector},
    ltv,
    predict_client,
    protocol_registry::LeverxRegistry,
    spot_swap,
    leverage_vault::{Self as vault_mod, LeverageVault},
};
use pyth::price_info::PriceInfoObject;
use sui::{clock::Clock, coin::{Self, Coin}};
use token::deep::DEEP;

/// Keeper liquidation for a binary market key: repay key debt and seize key collateral.
public fun flash_liquidate_binary<Quote, CollateralAsset>(
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
): (Coin<Quote>, Coin<CollateralAsset>) {
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
    emit_liquidation(
        proxy,
        key,
        debt,
        seized.value(),
        0,
        payment.value(),
        health,
        false,
        ctx,
    );
    (payment, seized)
}

/// Owner/executor liquidation with optional live position redeem before seize.
public fun flash_liquidate_with_redeem<Quote, CollateralAsset>(
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
    proxy.assert_can_act(ctx);

    let had_redeem = position_qty > 0;
    if (had_redeem) {
        predict_client::redeem_binary<Quote>(
            predict,
            manager,
            predict_oracle,
            key,
            position_qty,
            clock,
            ctx,
        );
        let payout = predict_client::manager_balance<Quote>(manager);
        if (payout > 0) {
            let coin = predict_client::withdraw_quote<Quote>(manager, payout, ctx);
            proxy.credit_quote_for_binary(key, coin, ctx);
        };
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
    emit_liquidation(
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

/// Liquidate a binary market key with DeepBook spot swap.
public fun flash_liquidate_binary_with_spot_swap<Quote, CollateralAsset>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    spot_pool: &mut Pool<CollateralAsset, Quote>,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    flash_loan_payment: Coin<Quote>,
    fee_deep: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, Coin<DEEP>) {
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
        let (_base_left, mut quote_out, deep_left) = spot_swap::swap_collateral_coin(
            spot_pool,
            seized,
            fee_deep,
            min_quote_out,
            clock,
            ctx,
        );
        let quote_from_swap = quote_out.value();
        skim_protocol_fee<Quote>(vault, collector, object::id(proxy), &mut quote_out, ctx);
        quote_left.join(quote_out);
        emit_liquidation(
            proxy,
            key,
            debt,
            collateral_seized,
            quote_from_swap,
            quote_left.value(),
            health,
            false,
            ctx,
        );
        (quote_left, deep_left)
    } else {
        emit_liquidation(proxy, key, debt, 0, 0, quote_left.value(), health, false, ctx);
        (quote_left, coin::zero(ctx))
    }
}

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
        predict_client::redeem_binary<Quote>(
            predict,
            manager,
            predict_oracle,
            key,
            position_qty,
            clock,
            ctx,
        );
        let payout = predict_client::manager_balance<Quote>(manager);
        if (payout > 0) {
            let coin = predict_client::withdraw_quote<Quote>(manager, payout, ctx);
            proxy.credit_quote_for_binary(key, coin, ctx);
        };
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
        let (_base_left, mut quote_out, deep_left) = spot_swap::swap_collateral_coin(
            spot_pool,
            seized,
            fee_deep,
            min_quote_out,
            clock,
            ctx,
        );
        let quote_from_swap = quote_out.value();
        skim_protocol_fee<Quote>(vault, collector, object::id(proxy), &mut quote_out, ctx);
        quote_left.join(quote_out);
        emit_liquidation(
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
        emit_liquidation(proxy, key, debt, 0, 0, quote_left.value(), health, had_redeem, ctx);
        (quote_left, coin::zero(ctx))
    }
}

/// Core liquidation: verify health, repay key debt to vault, seize key collateral.
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
    vault_mod::accrue_interest(vault, clock);
    let debt = proxy.binary_borrowed_quote(key);
    let collateral_amount = proxy.binary_collateral_balance<CollateralAsset>(key);
    assert!(debt > 0, errors::not_liquidatable());
    let health = ltv::evaluate_account_health<CollateralAsset, Quote>(
        registry,
        collateral_amount,
        debt,
        collateral_oracle,
        quote_oracle,
        clock,
    );
    assert!(
        ltv::is_liquidatable<CollateralAsset, Quote>(
            registry,
            collateral_amount,
            debt,
            collateral_oracle,
            quote_oracle,
            clock,
        ),
        errors::not_liquidatable(),
    );
    assert!(flash_loan_payment.value() >= debt, errors::insufficient_repayment());

    let mut payment = flash_loan_payment;
    let repay_coin = payment.split(debt, ctx);
    fee_collector::repay_vault_with_fee_split(
        vault,
        collector,
        repay_coin,
        protocol_constants::fee_source_interest(),
        clock,
        ctx,
    );
    proxy.record_repay_for_binary(key, debt);
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
