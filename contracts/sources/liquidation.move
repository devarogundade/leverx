// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Underwater position liquidation: repay vault debt from quote margin (dUSDC-only).
module leverx::liquidation;

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
    leverage_vault::{Self as vault_mod, LeverageVault},
    triggers,
};
use sui::{clock::Clock, coin::Coin};

/// Permissionless keeper path: redeem live position, repay debt from quote margin.
public fun flash_liquidate_with_redeem_permissionless<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    predict_oracle: &OracleSVI,
    key: MarketKey,
    position_qty: u64,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    protocol_registry::assert_predict(registry, predict);
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

    let (payment, debt, health) = flash_liquidate_binary_internal<Quote>(
        registry,
        vault,
        collector,
        proxy,
        key,
        flash_loan_payment,
        clock,
        ctx,
    );
    emit_liquidation(proxy, key, debt, payment.value(), health, had_redeem, ctx);
    if (had_redeem) {
        triggers::maybe_clear_binary_triggers_if_flat(proxy, manager, key);
    };
    payment
}

/// Permissionless keeper path for range keys: redeem, repay debt from quote margin.
public fun flash_liquidate_range_with_redeem_permissionless<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    predict: &mut Predict,
    manager: &mut PredictManager,
    predict_oracle: &OracleSVI,
    key: RangeKey,
    position_qty: u64,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote> {
    protocol_registry::assert_predict(registry, predict);
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

    let (payment, debt, health) = flash_liquidate_range_internal<Quote>(
        registry,
        vault,
        collector,
        proxy,
        key,
        flash_loan_payment,
        clock,
        ctx,
    );
    emit_range_liquidation(proxy, key, debt, payment.value(), health, had_redeem, ctx);
    if (had_redeem) {
        triggers::maybe_clear_range_triggers_if_flat(proxy, manager, key);
    };
    payment
}

fun flash_liquidate_binary_internal<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: MarketKey,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, u64, u64) {
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    proxy.cancel_binary_limit_mint_for_liquidation(key, ctx);
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.binary_borrowed_quote(key);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let margin_debt = proxy.binary_margin_debt(key);
    let leverage_bps = proxy.binary_leverage_bps(key);
    let health_debt = ltv::effective_health_debt(vault_debt, margin_debt, leverage_bps);
    let quote_balance = proxy.binary_quote_balance(key);
    assert!(health_debt > 0, errors::not_liquidatable());
    let health = ltv::evaluate_account_health(quote_balance, health_debt);
    assert!(
        ltv::is_liquidatable(quote_balance, health_debt, protocol_registry::liquidation_bps(registry)),
        errors::not_liquidatable(),
    );

    let mut payment = merge_binary_key_quote_into_payment(proxy, key, flash_loan_payment, ctx);
    if (vault_debt > 0) {
        assert!(payment.value() >= vault_debt, errors::insufficient_repayment());
        let repay_coin = payment.split(vault_debt, ctx);
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
        proxy.clear_binary_margin_debt(key);
        events::emit_vault_repaid(
            object::id(vault),
            object::id(proxy),
            proxy.owner(),
            vault_debt,
            vault_mod::total_borrowed(vault),
            vault_mod::utilization_bps(vault),
            vault_mod::current_borrow_rate(vault),
            vault_mod::current_lp_apr_bps(vault),
        );
        events::emit_debt_repaid(object::id(proxy), proxy.owner(), vault_debt, proxy.borrowed_quote());
        (payment, vault_debt, health)
    } else {
        proxy.clear_binary_margin_debt(key);
        (payment, 0, health)
    }
}

fun flash_liquidate_range_internal<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    proxy: &mut UserProxy,
    key: RangeKey,
    flash_loan_payment: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, u64, u64) {
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    proxy.cancel_range_limit_mint_for_liquidation(key, ctx);
    vault_mod::accrue_interest(vault, clock);
    let ledger_principal = proxy.range_borrowed_quote(key);
    let vault_debt = vault_mod::debt_with_accrued_interest(vault, ledger_principal);
    let margin_debt = proxy.range_margin_debt(key);
    let leverage_bps = proxy.range_leverage_bps(key);
    let health_debt = ltv::effective_health_debt(vault_debt, margin_debt, leverage_bps);
    let quote_balance = proxy.range_quote_balance(key);
    assert!(health_debt > 0, errors::not_liquidatable());
    let health = ltv::evaluate_account_health(quote_balance, health_debt);
    assert!(
        ltv::is_liquidatable(quote_balance, health_debt, protocol_registry::liquidation_bps(registry)),
        errors::not_liquidatable(),
    );

    let mut payment = merge_range_key_quote_into_payment(proxy, key, flash_loan_payment, ctx);
    if (vault_debt > 0) {
        assert!(payment.value() >= vault_debt, errors::insufficient_repayment());
        let repay_coin = payment.split(vault_debt, ctx);
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
        proxy.clear_range_margin_debt(key);
        events::emit_vault_repaid(
            object::id(vault),
            object::id(proxy),
            proxy.owner(),
            vault_debt,
            vault_mod::total_borrowed(vault),
            vault_mod::utilization_bps(vault),
            vault_mod::current_borrow_rate(vault),
            vault_mod::current_lp_apr_bps(vault),
        );
        events::emit_debt_repaid(object::id(proxy), proxy.owner(), vault_debt, proxy.borrowed_quote());
        (payment, vault_debt, health)
    } else {
        proxy.clear_range_margin_debt(key);
        (payment, 0, health)
    }
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

fun emit_liquidation(
    proxy: &UserProxy,
    key: MarketKey,
    debt_repaid: u64,
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
        debt_repaid,
        surplus_quote,
        health_bps,
        had_position_redeem,
    );
}

fun emit_range_liquidation(
    proxy: &UserProxy,
    key: RangeKey,
    debt_repaid: u64,
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
        debt_repaid,
        surplus_quote,
        health_bps,
        had_position_redeem,
    );
}
