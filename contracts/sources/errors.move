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

// --- Collateral & margin ---

const E_INSUFFICIENT_COLLATERAL: u64 = 6;
const E_COLLATERAL_NOT_SUPPORTED: u64 = 8;
const E_WITHDRAW_EXCEEDS_MAINTENANCE: u64 = 24;

// --- Debt & vault liquidity ---

const E_OUTSTANDING_DEBT: u64 = 11;
const E_INSUFFICIENT_COLLECTOR_BALANCE: u64 = 35;
const E_INSUFFICIENT_VAULT_LIQUIDITY: u64 = 7;
const E_INSUFFICIENT_REPAYMENT: u64 = 21;
const E_INVALID_FLASH_REPAYMENT: u64 = 22;

// --- LTV & liquidation ---

const E_LTV_EXCEEDED: u64 = 10;
const E_NOT_LIQUIDATABLE: u64 = 18;

// --- Oracle & pricing ---

const E_INVALID_PYTH_PRICE: u64 = 13;
const E_PRICE_FEED_MISMATCH: u64 = 14;
const E_ORACLE_NOT_SETTLED: u64 = 19;

// --- Swap routing ---

const E_INVALID_SWAP_POOL: u64 = 12;

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
const E_INVALID_COLLATERAL_CONFIG: u64 = 38;
const E_SAME_ASSET_SWAP: u64 = 39;
const E_LIQUIDATION_NO_COLLATERAL: u64 = 40;

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

// --- Collateral & margin ---

/// User does not hold enough quote margin or collateral for the operation.
public fun insufficient_collateral(): u64 { E_INSUFFICIENT_COLLATERAL }

/// Collateral type is not whitelisted in the protocol registry.
public fun collateral_not_supported(): u64 { E_COLLATERAL_NOT_SUPPORTED }

/// Withdrawal would drop position below maintenance LTV.
public fun withdraw_exceeds_maintenance(): u64 { E_WITHDRAW_EXCEEDS_MAINTENANCE }

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

/// Post-trade loan-to-value exceeds the collateral's max LTV cap.
public fun ltv_exceeded(): u64 { E_LTV_EXCEEDED }

/// Position health is above the liquidation threshold — cannot liquidate.
public fun not_liquidatable(): u64 { E_NOT_LIQUIDATABLE }

// --- Oracle & pricing ---

/// Pyth price is stale, zero, or fails confidence checks.
public fun invalid_pyth_price(): u64 { E_INVALID_PYTH_PRICE }

/// Supplied price feed ID does not match the collateral's registered feed.
public fun price_feed_mismatch(): u64 { E_PRICE_FEED_MISMATCH }

/// DeepBook Predict oracle has not settled for the current round.
public fun oracle_not_settled(): u64 { E_ORACLE_NOT_SETTLED }

// --- Swap routing ---

/// DeepBook pool ID does not match the registry's swap pool for this asset.
public fun invalid_swap_pool(): u64 { E_INVALID_SWAP_POOL }

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

// --- Triggers ---

/// No take-profit / stop-loss triggers are set for the requested market key.
public fun trigger_not_found(): u64 { E_TRIGGER_NOT_FOUND }

/// Vault object ID does not match the registry's linked vault.
public fun invalid_protocol_vault(): u64 { E_INVALID_PROTOCOL_VAULT }

/// Fee collector object ID does not match the registry's linked collector.
public fun invalid_fee_collector(): u64 { E_INVALID_FEE_COLLECTOR }

/// Collateral LTV parameters fail protocol sanity checks.
public fun invalid_collateral_config(): u64 { E_INVALID_COLLATERAL_CONFIG }

/// Spot swap requested with identical base and quote asset types.
public fun same_asset_swap(): u64 { E_SAME_ASSET_SWAP }

/// Liquidation invoked with zero balance for the declared collateral asset type.
public fun liquidation_no_collateral(): u64 { E_LIQUIDATION_NO_COLLATERAL }
