/** Shared Sui system clock object. */
export const SUI_CLOCK_OBJECT_ID = "0x6";

/** DeepBook Predict premium scale (1.0 = 1e9). */
export const PREDICT_PRICE_SCALE = 1_000_000_000n;

/** Default slippage for market mint/redeem (5%). */
export const DEFAULT_SLIPPAGE_BPS = 500;

/** Default placement slippage for limit orders (5%). */
export const DEFAULT_PLACEMENT_SLIPPAGE_BPS = 500;

/** Resting limit order lifetime options (hours). */
export const LIMIT_ORDER_EXPIRY_HOURS = [1, 4, 6, 12, 24] as const;

export type LimitOrderExpiryHours = (typeof LIMIT_ORDER_EXPIRY_HOURS)[number];

export const DEFAULT_LIMIT_ORDER_EXPIRY_HOURS: LimitOrderExpiryHours = 6;

/** Gas budget for simple trades. */
export const TRADE_GAS_BUDGET = 150_000_000;

/** Gas budget for onboarding (proxy + manager). */
export const ONBOARD_GAS_BUDGET = 100_000_000;
