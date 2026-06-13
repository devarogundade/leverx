/** Min/max leverage multiplier for trades (1x = no vault borrow). */
export const LEVERAGE_MIN = 1;
export const LEVERAGE_MAX = 10;
export const LEVERAGE_STEP = 0.1;
export const DEFAULT_LEVERAGE = LEVERAGE_MIN;

/** Min/max dUSDC margin per trade (USD). */
export const MIN_MARGIN_USD = 0.1;
export const MAX_MARGIN_USD = 100;

function roundToLeverageStep(value: number): number {
  const inv = 1 / LEVERAGE_STEP;
  return Math.round(value * inv) / inv;
}

export function clampLeverage(value: number): number {
  const rounded = roundToLeverageStep(value);
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

export const LIMIT_ORDER_EXPIRY_PRESETS = [
  { label: "15m", ms: 15 * 60_000 },
  { label: "30m", ms: 30 * 60_000 },
  { label: "45m", ms: 45 * 60_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "4h", ms: 4 * 3_600_000 },
  { label: "6h", ms: 6 * 3_600_000 },
  { label: "12h", ms: 12 * 3_600_000 },
  { label: "24h", ms: 24 * 3_600_000 },
] as const;

export const DEFAULT_LIMIT_ORDER_EXPIRY_MS = 6 * 3_600_000;

const MIN_RESTING_ORDER_LEAD_MS = 90_000;

export function marketRemainingMs(expiryMs: number, now = Date.now()): number {
  if (!expiryMs || expiryMs <= 0) return 0;
  return Math.max(0, expiryMs - now);
}

/** Presets that fit before market close (with a small buffer). */
export function availableLimitOrderExpiryPresets(
  expiryMs: number,
  now = Date.now(),
): readonly { label: string; ms: number }[] {
  const remaining = marketRemainingMs(expiryMs, now);
  if (remaining <= MIN_RESTING_ORDER_LEAD_MS) return [];
  return LIMIT_ORDER_EXPIRY_PRESETS.filter((p) => p.ms <= remaining - 60_000);
}

export function formatLimitOrderExpiryLabel(ms: number): string {
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes}m`;
  }
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/** Human-readable countdown for trade headers when expiry is soon. */
export function formatMarketCloses(expiryMs: number, now = Date.now()): string {
  if (!expiryMs || expiryMs <= 0) return "—";
  const remaining = marketRemainingMs(expiryMs, now);
  if (remaining <= 0) return "Closed";
  if (remaining < 3_600_000) {
    const minutes = Math.max(1, Math.ceil(remaining / 60_000));
    return minutes === 1 ? "1m left" : `${minutes}m left`;
  }
  if (remaining < 86_400_000) {
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m left`;
    if (hours > 0) return `${hours}h left`;
    return `${minutes}m left`;
  }
  return new Date(expiryMs).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function pickDefaultLimitOrderExpiryMs(
  expiryMs: number,
  now = Date.now(),
): number {
  const presets = availableLimitOrderExpiryPresets(expiryMs, now);
  if (presets.length === 0) return DEFAULT_LIMIT_ORDER_EXPIRY_MS;
  const preferred = presets.find((p) => p.ms === DEFAULT_LIMIT_ORDER_EXPIRY_MS);
  return preferred?.ms ?? presets[presets.length - 1]!.ms;
}

export type LeverageCountdownPhase = "leverage-open" | "leverage-closed" | "market-closed";

export function leverageClosesAtMs(expiryMs: number, windowMs: number): number {
  if (!expiryMs || expiryMs <= 0) return 0;
  return expiryMs - windowMs;
}

export function leverageCountdownState(
  expiryMs: number,
  windowMs: number,
  now = Date.now(),
): {
  phase: LeverageCountdownPhase;
  leverageClosesAtMs: number;
  leverageRemainingMs: number;
  marketRemainingMs: number;
} | null {
  if (!expiryMs || expiryMs <= 0) return null;

  const marketRemaining = marketRemainingMs(expiryMs, now);
  const closesAt = leverageClosesAtMs(expiryMs, windowMs);

  if (marketRemaining <= 0) {
    return {
      phase: "market-closed",
      leverageClosesAtMs: closesAt,
      leverageRemainingMs: 0,
      marketRemainingMs: 0,
    };
  }

  const leverageRemaining = Math.max(0, closesAt - now);
  return {
    phase: leverageRemaining > 0 ? "leverage-open" : "leverage-closed",
    leverageClosesAtMs: closesAt,
    leverageRemainingMs: leverageRemaining,
    marketRemainingMs: marketRemaining,
  };
}

/** Stopwatch display — HH:MM:SS when ≥1h, else MM:SS. */
export function formatCountdownStopwatch(remainingMs: number): string {
  if (remainingMs <= 0) return "00:00";
  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function maxLeverageLabelForExpiry(
  expiryMs: number | undefined,
  windowMs: number,
  now = Date.now(),
): string {
  if (!expiryMs || expiryMs <= 0) return "10X";
  return isLeveragedMintAllowed(expiryMs, windowMs, now) ? "10X" : "1X";
}
