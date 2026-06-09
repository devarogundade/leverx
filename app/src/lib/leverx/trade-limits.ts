/** Min/max leverage multiplier for trades. */
export const LEVERAGE_MIN = 1.1;
export const LEVERAGE_MAX = 10;
export const LEVERAGE_STEP = 0.1;
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
