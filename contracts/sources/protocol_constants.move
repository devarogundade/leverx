// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Protocol-wide numeric constants (named to avoid deepbook::constants collision at 0x0).
module leverx::protocol_constants;

// --- Basis points & token decimals ---

const BPS: u64 = 10_000;
const USD_DECIMALS: u8 = 9;
const QUOTE_DECIMALS: u8 = 6;

// --- Leverage bounds ---

const MAX_LEVERAGE: u64 = 10;
const MIN_LEVERAGE: u64 = 1;

// --- Default LTV thresholds (bps) ---
// Per-asset max/liquidation LTV is set at admin whitelist time (see deploy docs).
// Launch targets (env / ops, not hardcoded here): SUI 80%, dUSDC 90%, DEEP 70%; liq floor 95% for all.

const DEFAULT_MAX_LTV_BPS: u64 = 8_000;
const DEFAULT_LIQUIDATION_LTV_BPS: u64 = 8_500;

// --- Pyth oracle defaults ---

const DEFAULT_PYTH_MAX_AGE_SECS: u64 = 60;
/// Wider staleness window for liquidation-only Pyth reads (trading stays at `DEFAULT_PYTH_MAX_AGE_SECS`).
const LIQUIDATION_PYTH_MAX_AGE_SECS: u64 = 300;
/// Admin cannot set trading staleness above this bound.
const MAX_PYTH_MAX_AGE_SECS: u64 = 300;
const PYTH_EXPONENT_BUFFER: u8 = 10;

// --- Interest rate model defaults (two-slope kink) ---

const DEFAULT_BASE_RATE_BPS: u64 = 200;
const DEFAULT_KINK_UTIL_BPS: u64 = 8_000;
const DEFAULT_SLOPE1_BPS: u64 = 1_000;
const DEFAULT_SLOPE2_BPS: u64 = 5_000;

// --- Flash loan & liquidation fees ---

const DEFAULT_FLASH_FEE_BPS: u64 = 5;
const DEFAULT_LIQUIDATION_INSURANCE_BPS: u64 = 100;

// --- Protocol revenue split (must sum to BPS) ---

const VAULT_FEE_SHARE_BPS: u64 = 8_000;
const FEE_COLLECTOR_SHARE_BPS: u64 = 1_000;
const KEEPER_FEE_SHARE_BPS: u64 = 1_000;

// --- Fee source tags (indexer / analytics) ---

const FEE_SOURCE_INTEREST: u8 = 1;
const FEE_SOURCE_FLASH_LOAN: u8 = 2;
const FEE_SOURCE_LIQUIDATION: u8 = 3;

// --- Time ---

const YEAR_MS: u64 = 31_536_000_000;

// --- DeepBook Predict pricing ---

/// DeepBook Predict premium scale (1.0 = 1_000_000_000).
const PREDICT_PRICE_SCALE: u64 = 1_000_000_000;

// --- Order types & limit-order slippage ---

const ORDER_TYPE_MARKET: u8 = 0;
const ORDER_TYPE_LIMIT: u8 = 1;
/// Max slippage bps allowed when placing or filling a resting limit mint order.
const MAX_LIMIT_ORDER_SLIPPAGE_BPS: u64 = 5_000;

// --- Public getters: basis & decimals ---

/// Denominator for basis-point math (10_000 = 100%).
public fun bps(): u64 { BPS }

/// Multiply `amount` by basis points (10_000 = 100%).
public fun mul_bps(amount: u64, bps: u64): u64 {
    ((amount as u128) * (bps as u128) / (BPS as u128)) as u64
}

/// Decimal places for USD-denominated internal accounting.
public fun usd_decimals(): u8 { USD_DECIMALS }

/// Decimal places for the quote token (e.g. dUSDC).
public fun quote_decimals(): u8 { QUOTE_DECIMALS }

// --- Public getters: leverage ---

/// Maximum allowed leverage multiplier.
public fun max_leverage(): u64 { MAX_LEVERAGE }

/// Minimum allowed leverage multiplier.
public fun min_leverage(): u64 { MIN_LEVERAGE }

/// `max_leverage()` expressed in basis points for LTV-style comparisons.
public fun max_leverage_bps(): u64 {
    MAX_LEVERAGE * BPS
}

// --- Public getters: LTV ---

/// Default max borrow LTV before new positions are rejected (80%).
public fun default_max_ltv_bps(): u64 { DEFAULT_MAX_LTV_BPS }

/// Default LTV at which a position becomes liquidatable (85%).
public fun default_liquidation_ltv_bps(): u64 { DEFAULT_LIQUIDATION_LTV_BPS }

// --- Public getters: oracle ---

/// Maximum Pyth price age in seconds before a feed is considered stale.
public fun default_pyth_max_age_secs(): u64 { DEFAULT_PYTH_MAX_AGE_SECS }

/// Staleness bound for liquidation health checks (wider than trading to reduce oracle-stall bad debt).
public fun liquidation_pyth_max_age_secs(): u64 { LIQUIDATION_PYTH_MAX_AGE_SECS }

/// Upper cap admin may set for trading-time Pyth staleness.
public fun max_pyth_max_age_secs(): u64 { MAX_PYTH_MAX_AGE_SECS }

/// Extra exponent headroom when normalizing Pyth prices to internal decimals.
public fun pyth_exponent_buffer(): u8 { PYTH_EXPONENT_BUFFER }

// --- Public getters: interest rate model ---

/// Base borrow rate at zero utilization.
public fun default_base_rate_bps(): u64 { DEFAULT_BASE_RATE_BPS }

/// Utilization kink where the second slope begins.
public fun default_kink_util_bps(): u64 { DEFAULT_KINK_UTIL_BPS }

/// Borrow rate slope below the kink utilization.
public fun default_slope1_bps(): u64 { DEFAULT_SLOPE1_BPS }

/// Borrow rate slope above the kink utilization.
public fun default_slope2_bps(): u64 { DEFAULT_SLOPE2_BPS }

// --- Public getters: fees ---

/// Default DeepBook flash-loan fee in basis points.
public fun default_flash_fee_bps(): u64 { DEFAULT_FLASH_FEE_BPS }

/// Insurance fund share of liquidation bonus in basis points.
public fun default_liquidation_insurance_bps(): u64 { DEFAULT_LIQUIDATION_INSURANCE_BPS }

/// LP vault share of protocol fee revenue (80%).
public fun vault_fee_share_bps(): u64 { VAULT_FEE_SHARE_BPS }

/// Protocol treasury share routed to `FeeCollector` (10%).
public fun fee_collector_share_bps(): u64 { FEE_COLLECTOR_SHARE_BPS }

/// Keeper / transaction-sender share of protocol fee revenue (10%).
public fun keeper_fee_share_bps(): u64 { KEEPER_FEE_SHARE_BPS }

/// Fee source tag: borrow interest realized on vault repay.
public fun fee_source_interest(): u8 { FEE_SOURCE_INTEREST }

/// Fee source tag: vault flash-loan fee.
public fun fee_source_flash_loan(): u8 { FEE_SOURCE_FLASH_LOAN }

/// Fee source tag: liquidation swap skim / protocol bonus.
public fun fee_source_liquidation(): u8 { FEE_SOURCE_LIQUIDATION }

// --- Public getters: time ---

/// Milliseconds in a 365-day year — used for interest accrual.
public fun year_ms(): u64 { YEAR_MS }

// --- Public getters: Predict & orders ---

/// Scale factor for DeepBook Predict per-contract premiums (1e9 = 1.0).
public fun predict_price_scale(): u64 { PREDICT_PRICE_SCALE }

/// Order type tag for immediate market fills.
public fun order_type_market(): u8 { ORDER_TYPE_MARKET }

/// Order type tag for resting limit orders.
public fun order_type_limit(): u8 { ORDER_TYPE_LIMIT }

/// Upper bound on slippage bps for limit mint placement and keeper fills.
public fun max_limit_order_slippage_bps(): u64 { MAX_LIMIT_ORDER_SLIPPAGE_BPS }
