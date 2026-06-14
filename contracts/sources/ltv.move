// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Quote-only margin health for dUSDC positions (no oracle).
module leverx::ltv;

use leverx::{protocol_constants, errors};

/// Multiply `amount` by basis points (10_000 = 100%).
public fun mul_bps(amount: u64, bps: u64): u64 {
    protocol_constants::mul_bps(amount, bps)
}

/// Position size from margin and leverage bps (e.g. 2x = 20_000 bps).
public fun position_from_margin(margin_quote: u64, leverage_bps: u64): u64 {
    assert_leverage_bps(leverage_bps);
    mul_bps(margin_quote, leverage_bps)
}

/// Borrow amount for leveraged trade (position minus posted margin).
public fun borrow_for_leverage(position_quote: u64, margin_quote: u64): u64 {
    assert!(position_quote >= margin_quote, errors::invalid_leverage());
    position_quote - margin_quote
}

/// Leverage bps from posted margin and outstanding vault borrow (`10_000` = 1× when borrow is zero).
public fun leverage_bps_from_margin_and_borrow(margin_quote: u64, borrowed_quote: u64): u64 {
    if (borrowed_quote == 0) return protocol_constants::bps();
    assert!(margin_quote > 0, errors::invalid_leverage());
    let position = (margin_quote as u128) + (borrowed_quote as u128);
    let bps = (position * (protocol_constants::bps() as u128) / (margin_quote as u128)) as u64;
    assert_leverage_bps(bps);
    bps
}

/// True when leverage is above 1x (vault borrow permitted).
public fun is_leveraged(leverage_bps: u64): bool {
    leverage_bps > protocol_constants::bps()
}

/// Debt used for health: unleveraged (1x) positions are never liquidatable.
public fun effective_health_debt(vault_debt: u64, margin_debt: u64, leverage_bps: u64): u64 {
    if (!is_leveraged(leverage_bps)) return 0;
    if (vault_debt > 0) {
        vault_debt
    } else {
        margin_debt
    }
}

/// Health factor in bps: `(quote_balance * BPS) / debt` (or `BPS * 10` when debt is zero).
public fun evaluate_account_health(quote_balance: u64, debt: u64): u64 {
    if (debt == 0) return protocol_constants::bps() * 10;
    quote_balance * protocol_constants::bps() / debt
}

/// Health factor using vault debt, posted margin debt, and current leverage.
public fun evaluate_position_health(
    quote_balance: u64,
    vault_debt: u64,
    margin_debt: u64,
    leverage_bps: u64,
): u64 {
    evaluate_account_health(quote_balance, effective_health_debt(vault_debt, margin_debt, leverage_bps))
}

/// True when account health is below the liquidation threshold.
public fun is_liquidatable(quote_balance: u64, debt: u64, liquidation_bps: u64): bool {
    if (debt == 0) return false;
    evaluate_account_health(quote_balance, debt) < liquidation_bps
}

/// True when health is below the margin-call threshold (vault or posted margin debt).
public fun is_position_liquidatable(
    quote_balance: u64,
    vault_debt: u64,
    margin_debt: u64,
    leverage_bps: u64,
    liquidation_bps: u64,
): bool {
    is_liquidatable(
        quote_balance,
        effective_health_debt(vault_debt, margin_debt, leverage_bps),
        liquidation_bps,
    )
}

/// Assert leverage is within protocol min/max bounds.
public fun assert_leverage_bps(leverage_bps: u64) {
    assert!(leverage_bps >= protocol_constants::min_leverage_bps(), errors::invalid_leverage());
    assert!(leverage_bps <= protocol_constants::max_leverage_bps(), errors::invalid_leverage());
}

/// Assert margin is within protocol min/max bounds.
public fun assert_margin_quote(margin_quote: u64) {
    assert!(margin_quote >= protocol_constants::min_margin_quote(), errors::invalid_margin());
    assert!(margin_quote <= protocol_constants::max_margin_quote(), errors::invalid_margin());
}

#[test_only]
public fun test_mul_bps(amount: u64, bps: u64): u64 {
    mul_bps(amount, bps)
}
