// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Protocol-wide numeric constants (named to avoid deepbook::constants collision at 0x0).
module leverx::protocol_constants;

// --- Basis points & token decimals ---

const BPS: u64 = 10_000;
const USD_DECIMALS: u8 = 9;
const QUOTE_DECIMALS: u8 = 6;

// --- Leverage bounds & margin call ---

const MAX_LEVERAGE: u64 = 10;
/// Minimum leverage in bps (10_000 bps = 1x, no vault borrow).
const MIN_LEVERAGE_BPS: u64 = 10_000;
const MARGIN_CALL_BPS: u64 = 9_500;

/// Leveraged mints (>1x) are blocked in the final hour before oracle expiry.
const LEVERAGED_MINT_WINDOW_MS: u64 = 3_600_000;

// --- Margin bounds (dUSDC, 6 decimals) ---

const MIN_MARGIN_QUOTE: u64 = 100_000;
const MAX_MARGIN_QUOTE: u64 = 100_000_000;

// --- Interest rate model defaults (two-slope kink) ---

const DEFAULT_BASE_RATE_BPS: u64 = 200;
const DEFAULT_KINK_UTIL_BPS: u64 = 8_000;
const DEFAULT_SLOPE1_BPS: u64 = 1_000;
const DEFAULT_SLOPE2_BPS: u64 = 5_000;

// --- Flash loan fees ---

const DEFAULT_FLASH_FEE_BPS: u64 = 5;

// --- Protocol revenue split (must sum to BPS) ---

const VAULT_FEE_SHARE_BPS: u64 = 8_000;
const FEE_COLLECTOR_SHARE_BPS: u64 = 1_000;
const KEEPER_FEE_SHARE_BPS: u64 = 1_000;

// --- Fee source tags (indexer / analytics) ---

const FEE_SOURCE_INTEREST: u8 = 1;
const FEE_SOURCE_FLASH_LOAN: u8 = 2;
const FEE_SOURCE_LIQUIDATION: u8 = 3;
const FEE_SOURCE_INSURANCE: u8 = 4;

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

// --- Public getters: leverage & margin call ---

/// Maximum allowed leverage multiplier.
public fun max_leverage(): u64 { MAX_LEVERAGE }

/// Minimum allowed leverage in basis points (10_000 = 1x).
public fun min_leverage_bps(): u64 { MIN_LEVERAGE_BPS }

/// Final-hour window (ms): leveraged mints (>1x) blocked; force-deleverage allowed.
public fun leveraged_mint_window_ms(): u64 { LEVERAGED_MINT_WINDOW_MS }

/// `max_leverage()` expressed in basis points (10_000 bps = 1x).
public fun max_leverage_bps(): u64 {
    MAX_LEVERAGE * BPS
}

/// Minimum dUSDC margin per trade in quote atoms (0.1 dUSDC).
public fun min_margin_quote(): u64 { MIN_MARGIN_QUOTE }

/// Maximum dUSDC margin per trade in quote atoms (100 dUSDC).
public fun max_margin_quote(): u64 { MAX_MARGIN_QUOTE }

/// Margin-call health threshold in basis points (liquidate when health < this).
public fun margin_call_bps(): u64 { MARGIN_CALL_BPS }

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

/// Default vault flash-loan fee in basis points.
public fun default_flash_fee_bps(): u64 { DEFAULT_FLASH_FEE_BPS }

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

/// Fee source tag: liquidation surplus skim.
public fun fee_source_liquidation(): u8 { FEE_SOURCE_LIQUIDATION }

/// Fee source tag: insurance fund applied to residual borrower debt.
public fun fee_source_insurance(): u8 { FEE_SOURCE_INSURANCE }

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
