// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Abort codes — exposed via functions and `E_*` constants for `#[expected_failure]`.
module leverx::errors;

// --- Auth & access control ---

const E_NOT_OWNER: u64 = 1;
const E_NOT_AUTHORIZED: u64 = 17;
const E_INVALID_MANAGER: u64 = 9;

// --- Protocol state ---

const E_TRADING_PAUSED: u64 = 2;

// --- Input validation ---

const E_ZERO_AMOUNT: u64 = 3;
const E_ZERO_QUANTITY: u64 = 4;
const E_INVALID_LEVERAGE: u64 = 5;

// --- Margin ---

const E_INSUFFICIENT_MARGIN: u64 = 6;
const E_INVALID_PREDICT: u64 = 8;
const E_LIMIT_ORDER_STILL_ACTIVE: u64 = 12;

// --- Debt & vault liquidity ---

const E_OUTSTANDING_DEBT: u64 = 11;
const E_INSUFFICIENT_COLLECTOR_BALANCE: u64 = 35;
const E_INSUFFICIENT_VAULT_LIQUIDITY: u64 = 7;
const E_INSUFFICIENT_REPAYMENT: u64 = 21;
const E_INVALID_FLASH_REPAYMENT: u64 = 22;

// --- LTV & liquidation ---

const E_NOT_LIQUIDATABLE: u64 = 18;

// --- Oracle & pricing ---

const E_ORACLE_NOT_SETTLED: u64 = 19;

// --- Trading & slippage ---

const E_MINT_COST_EXCEEDS_POSITION: u64 = 23;
const E_LIMIT_PRICE_NOT_MET: u64 = 25;
const E_SLIPPAGE_EXCEEDED: u64 = 26;
const E_ASK_OUT_OF_BOUNDS: u64 = 27;
const E_INVALID_ORDER_TYPE: u64 = 28;

// --- Resting limit orders ---

const E_LIMIT_ORDER_NOT_FOUND: u64 = 29;
const E_PLACEMENT_PRICE_NOT_ALIGNED: u64 = 30;
const E_LIMIT_ORDER_EXISTS: u64 = 31;
const E_SLIPPAGE_TOO_HIGH: u64 = 32;
const E_LIMIT_ORDER_EXPIRED: u64 = 33;
const E_INVALID_LIMIT_ORDER_EXPIRY: u64 = 34;

// --- Triggers ---

const E_TRIGGER_NOT_FOUND: u64 = 20;

// --- Registry wiring ---

const E_INVALID_PROTOCOL_VAULT: u64 = 36;
const E_INVALID_FEE_COLLECTOR: u64 = 37;
const E_INVALID_MARGIN: u64 = 41;

// --- Auth & access control ---

/// Caller is not the proxy owner or registered session executor.
public fun not_owner(): u64 { E_NOT_OWNER }

/// Session executor lacks permission for the requested action.
public fun not_authorized(): u64 { E_NOT_AUTHORIZED }

/// PredictManager object ID does not match the one linked on the user proxy.
public fun invalid_manager(): u64 { E_INVALID_MANAGER }

// --- Protocol state ---

/// Global trading halt is active on the registry.
public fun trading_paused(): u64 { E_TRADING_PAUSED }

// --- Input validation ---

/// Amount parameter must be strictly positive.
public fun zero_amount(): u64 { E_ZERO_AMOUNT }

/// Contract quantity parameter must be strictly positive.
public fun zero_quantity(): u64 { E_ZERO_QUANTITY }

/// Leverage is outside the protocol min/max bounds.
public fun invalid_leverage(): u64 { E_INVALID_LEVERAGE }

// --- Margin ---

/// User does not hold enough quote margin for the operation.
public fun insufficient_margin(): u64 { E_INSUFFICIENT_MARGIN }

/// Margin amount is outside the protocol min/max bounds.
public fun invalid_margin(): u64 { E_INVALID_MARGIN }

/// Predict shared object ID does not match the registry's linked deployment.
public fun invalid_predict(): u64 { E_INVALID_PREDICT }

// --- Debt & vault liquidity ---

/// Repayment or debt mutation exceeds outstanding borrowed quote on the ledger.
public fun outstanding_debt(): u64 { E_OUTSTANDING_DEBT }

/// Fee collector balance is insufficient for the requested withdrawal.
public fun insufficient_collector_balance(): u64 { E_INSUFFICIENT_COLLECTOR_BALANCE }

/// Vault cannot supply the requested borrow amount.
public fun insufficient_vault_liquidity(): u64 { E_INSUFFICIENT_VAULT_LIQUIDITY }

/// Repayment amount is below the minimum required to close or reduce debt.
public fun insufficient_repayment(): u64 { E_INSUFFICIENT_REPAYMENT }

/// Flash-loan repayment does not match the borrowed amount plus fee.
public fun invalid_flash_repayment(): u64 { E_INVALID_FLASH_REPAYMENT }

// --- LTV & liquidation ---

/// Position health is above the liquidation threshold — cannot liquidate.
public fun not_liquidatable(): u64 { E_NOT_LIQUIDATABLE }

// --- Oracle & pricing ---

/// DeepBook Predict oracle has not settled for the current round.
public fun oracle_not_settled(): u64 { E_ORACLE_NOT_SETTLED }

// --- Trading & slippage ---

/// Actual mint cost exceeds the user's margin plus allowed borrow.
public fun mint_cost_exceeds_position(): u64 { E_MINT_COST_EXCEEDS_POSITION }

/// Market ask or bid does not satisfy the limit or slippage bound.
public fun limit_price_not_met(): u64 { E_LIMIT_PRICE_NOT_MET }

/// Fill price moved beyond the caller's slippage tolerance.
public fun slippage_exceeded(): u64 { E_SLIPPAGE_EXCEEDED }

/// Requested ask premium is outside the Predict market's valid range.
public fun ask_out_of_bounds(): u64 { E_ASK_OUT_OF_BOUNDS }

/// Order type is neither market nor limit where one is required.
public fun invalid_order_type(): u64 { E_INVALID_ORDER_TYPE }

// --- Resting limit orders ---

/// No resting limit order exists for the given key and client order ID.
public fun limit_order_not_found(): u64 { E_LIMIT_ORDER_NOT_FOUND }

/// Current market ask is not within placement limit ± frozen slippage.
public fun placement_price_not_aligned(): u64 { E_PLACEMENT_PRICE_NOT_ALIGNED }

/// A limit order with this client order ID is already registered.
public fun limit_order_exists(): u64 { E_LIMIT_ORDER_EXISTS }

/// Slippage bps exceeds the protocol maximum for limit orders.
public fun slippage_too_high(): u64 { E_SLIPPAGE_TOO_HIGH }

/// Resting limit order has passed its expiry timestamp.
public fun limit_order_expired(): u64 { E_LIMIT_ORDER_EXPIRED }

/// Expiry is in the past or after the market's oracle expiry.
public fun invalid_limit_order_expiry(): u64 { E_INVALID_LIMIT_ORDER_EXPIRY }

/// Resting limit order has not yet passed its expiry timestamp.
public fun limit_order_still_active(): u64 { E_LIMIT_ORDER_STILL_ACTIVE }

// --- Triggers ---

/// No take-profit / stop-loss triggers are set for the requested market key.
public fun trigger_not_found(): u64 { E_TRIGGER_NOT_FOUND }

/// Vault object ID does not match the registry's linked vault.
public fun invalid_protocol_vault(): u64 { E_INVALID_PROTOCOL_VAULT }

/// Fee collector object ID does not match the registry's linked collector.
public fun invalid_fee_collector(): u64 { E_INVALID_FEE_COLLECTOR }
