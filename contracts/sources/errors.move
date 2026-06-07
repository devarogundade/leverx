// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Abort codes — exposed via functions (Move 2024 constants are module-private).
module leverx::errors;

// --- Auth & access control ---

/// Caller is not the proxy owner or registered session executor.
public fun not_owner(): u64 { 1 }

/// Session executor lacks permission for the requested action.
public fun not_authorized(): u64 { 17 }

/// PredictManager object ID does not match the one linked on the user proxy.
public fun invalid_manager(): u64 { 9 }

// --- Protocol state ---

/// Global trading halt is active on the registry.
public fun trading_paused(): u64 { 2 }

// --- Input validation ---

/// Amount parameter must be strictly positive.
public fun zero_amount(): u64 { 3 }

/// Contract quantity parameter must be strictly positive.
public fun zero_quantity(): u64 { 4 }

/// Leverage is outside the protocol min/max bounds.
public fun invalid_leverage(): u64 { 5 }

// --- Collateral & margin ---

/// User does not hold enough quote margin or collateral for the operation.
public fun insufficient_collateral(): u64 { 6 }

/// Collateral type is not whitelisted in the protocol registry.
public fun collateral_not_supported(): u64 { 8 }

/// Withdrawal would drop position below maintenance LTV.
public fun withdraw_exceeds_maintenance(): u64 { 24 }

// --- Debt & vault liquidity ---

/// Repayment or debt mutation exceeds outstanding borrowed quote on the ledger.
public fun outstanding_debt(): u64 { 11 }

/// Fee collector balance is insufficient for the requested withdrawal.
public fun insufficient_collector_balance(): u64 { 35 }

/// Vault cannot supply the requested borrow amount.
public fun insufficient_vault_liquidity(): u64 { 7 }

/// Repayment amount is below the minimum required to close or reduce debt.
public fun insufficient_repayment(): u64 { 21 }

/// Flash-loan repayment does not match the borrowed amount plus fee.
public fun invalid_flash_repayment(): u64 { 22 }

// --- LTV & liquidation ---

/// Post-trade loan-to-value exceeds the collateral's max LTV cap.
public fun ltv_exceeded(): u64 { 10 }

/// Position health is above the liquidation threshold — cannot liquidate.
public fun not_liquidatable(): u64 { 18 }

// --- Oracle & pricing ---

/// Pyth price is stale, zero, or fails confidence checks.
public fun invalid_pyth_price(): u64 { 13 }

/// Supplied price feed ID does not match the collateral's registered feed.
public fun price_feed_mismatch(): u64 { 14 }

/// DeepBook Predict oracle has not settled for the current round.
public fun oracle_not_settled(): u64 { 19 }

// --- Swap routing ---

/// DeepBook pool ID does not match the registry's swap pool for this asset.
public fun invalid_swap_pool(): u64 { 12 }

// --- Trading & slippage ---

/// Actual mint cost exceeds the user's margin plus allowed borrow.
public fun mint_cost_exceeds_position(): u64 { 23 }

/// Market ask or bid does not satisfy the limit or slippage bound.
public fun limit_price_not_met(): u64 { 25 }

/// Fill price moved beyond the caller's slippage tolerance.
public fun slippage_exceeded(): u64 { 26 }

/// Requested ask premium is outside the Predict market's valid range.
public fun ask_out_of_bounds(): u64 { 27 }

/// Order type is neither market nor limit where one is required.
public fun invalid_order_type(): u64 { 28 }

// --- Resting limit orders ---

/// No resting limit order exists for the given key and client order ID.
public fun limit_order_not_found(): u64 { 29 }

/// Current market ask is not within placement limit ± frozen slippage.
public fun placement_price_not_aligned(): u64 { 30 }

/// A limit order with this client order ID is already registered.
public fun limit_order_exists(): u64 { 31 }

/// Slippage bps exceeds the protocol maximum for limit orders.
public fun slippage_too_high(): u64 { 32 }

/// Resting limit order has passed its expiry timestamp.
public fun limit_order_expired(): u64 { 33 }

/// Expiry is in the past or after the market's oracle expiry.
public fun invalid_limit_order_expiry(): u64 { 34 }

// --- Triggers ---

/// No take-profit / stop-loss triggers are set for the requested market key.
public fun trigger_not_found(): u64 { 20 }

/// Vault object ID does not match the registry's linked vault.
public fun invalid_protocol_vault(): u64 { 36 }

/// Fee collector object ID does not match the registry's linked collector.
public fun invalid_fee_collector(): u64 { 37 }

/// Collateral LTV parameters fail protocol sanity checks.
public fun invalid_collateral_config(): u64 { 38 }
