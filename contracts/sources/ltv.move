// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Quote-only margin health for dUSDC positions (no oracle).
module leverx::ltv;

use leverx::{protocol_constants, errors};

/// Multiply `amount` by basis points (10_000 = 100%).
public fun mul_bps(amount: u64, bps: u64): u64 {
    protocol_constants::mul_bps(amount, bps)
}

/// Position size from margin — fixed 1:1 leverage returns margin as-is.
public fun position_from_margin(margin_quote: u64, _leverage_bps: u64): u64 {
    margin_quote
}

/// Borrow amount for leveraged trade — fixed 1x returns zero.
public fun borrow_for_leverage(_position_quote: u64, _margin_quote: u64): u64 {
    0
}

/// Debt used for health: vault debt with interest takes precedence over posted margin.
public fun effective_health_debt(vault_debt: u64, margin_debt: u64): u64 {
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

/// Health factor using vault debt and posted margin debt.
public fun evaluate_position_health(
    quote_balance: u64,
    vault_debt: u64,
    margin_debt: u64,
): u64 {
    evaluate_account_health(quote_balance, effective_health_debt(vault_debt, margin_debt))
}

/// True when account health is below the margin-call threshold.
public fun is_liquidatable(quote_balance: u64, debt: u64): bool {
    if (debt == 0) return false;
    evaluate_account_health(quote_balance, debt) < protocol_constants::margin_call_bps()
}

/// True when health is below the margin-call threshold (vault or posted margin debt).
public fun is_position_liquidatable(
    quote_balance: u64,
    vault_debt: u64,
    margin_debt: u64,
): bool {
    is_liquidatable(quote_balance, effective_health_debt(vault_debt, margin_debt))
}

/// Assert leverage equals the protocol-fixed 1x rate.
public fun assert_leverage_bps(leverage_bps: u64) {
    assert!(leverage_bps == protocol_constants::leverage_bps(), errors::invalid_leverage());
}

#[test_only]
public fun test_mul_bps(amount: u64, bps: u64): u64 {
    mul_bps(amount, bps)
}
