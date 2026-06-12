/** Min/max leverage multiplier for trades (1x = no vault borrow). */
export const LEVERAGE_MIN = 1;
export const LEVERAGE_MAX = 10;
export const LEVERAGE_STEP = 0.5;
export const DEFAULT_LEVERAGE = LEVERAGE_MIN;

/** Min/max dUSDC margin per trade (USD). */
export const MIN_MARGIN_USD = 0.1;
export const MAX_MARGIN_USD = 100;

export function clampLeverage(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(LEVERAGE_MAX, Math.max(LEVERAGE_MIN, rounded));
}

export function formatLeverage(value: number): string {
  const clamped = clampLeverage(value);
  return Number.isInteger(clamped) ? `${clamped}x` : `${clamped.toFixed(1)}x`;
}

export function formatLeverageBadge(value: number): string {
  const clamped = clampLeverage(value);
  return Number.isInteger(clamped) ? `${clamped}X` : `${clamped.toFixed(1)}X`;
}

export function isMarginInBounds(marginUsd: number): boolean {
  return Number.isFinite(marginUsd) && marginUsd >= MIN_MARGIN_USD && marginUsd <= MAX_MARGIN_USD;
}

/** Whether the market is in its final hour before expiry. */
export function isFinalHourBeforeExpiry(
  expiryMs: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  if (!expiryMs || expiryMs <= 0) return false;
  return now >= expiryMs - windowMs && now < expiryMs;
}

/** Whether leverage above 1x may be opened (blocked in the final hour). */
export function isLeveragedMintAllowed(
  expiryMs: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  if (!expiryMs || expiryMs <= 0) return true;
  return now < expiryMs - windowMs;
}

/** Latest resting-order expiry when opening above 1x (must end before the final hour). */
export function maxLeveragedRestingOrderExpiryMs(
  expiryMs: number,
  windowMs: number,
): number | null {
  if (!expiryMs || expiryMs <= 0) return null;
  return expiryMs - windowMs - 1;
}
