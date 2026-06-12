/** Shared Sui system clock object. */
export const SUI_CLOCK_OBJECT_ID = "0x6";

/** DeepBook Predict premium scale (1.0 = 1e9). */
export const PREDICT_PRICE_SCALE = 1_000_000_000n;

/**
 * Quantity used when simulating per-contract ask via dev-inspect.
 * Predict mint costs are integer quote atoms; qty=1 often rounds to 0 and reads as untradeable.
 */
export const PREDICT_QUOTE_REFERENCE_QUANTITY = 1_000_000n;

/** Headroom below leveraged position size so mint_cost <= margin + borrow on-chain. */
export const MINT_BUDGET_SAFETY_BPS = 50;

/** Default slippage for market mint/redeem (5%). */
export const DEFAULT_SLIPPAGE_BPS = 500;

/** Default placement slippage for limit orders (5%). */
export const DEFAULT_PLACEMENT_SLIPPAGE_BPS = 500;

/** On-chain max for limit / placement slippage (`protocol_constants::max_limit_order_slippage_bps`). */
export const MAX_LIMIT_ORDER_SLIPPAGE_BPS = 5_000;
export const MAX_LIMIT_ORDER_SLIPPAGE_PCT = MAX_LIMIT_ORDER_SLIPPAGE_BPS / 100;

/** Resting limit order lifetime options (hours). */
export const LIMIT_ORDER_EXPIRY_HOURS = [1, 4, 6, 12, 24] as const;

export type LimitOrderExpiryHours = (typeof LIMIT_ORDER_EXPIRY_HOURS)[number];

export const DEFAULT_LIMIT_ORDER_EXPIRY_HOURS: LimitOrderExpiryHours = 6;

/** Leveraged mints (>1x) blocked in the final hour before oracle expiry. */
export const LEVERAGED_MINT_WINDOW_MS = 3_600_000;

/** Gas budget for simple trades. */
export const TRADE_GAS_BUDGET = 150_000_000;

/** Gas budget for onboarding (proxy + manager). */
export const ONBOARD_GAS_BUDGET = 100_000_000;
