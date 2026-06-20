/** Telegram bot trade sizing — mirrors app trade-math (dUSDC + Predict 1e9 premium scale). */

export const QUOTE_UNIT = 1_000_000n;
export const PREDICT_PRICE_SCALE = 1_000_000_000n;
export const FLOAT_SCALING = 1_000_000_000;
export const MINT_BUDGET_SAFETY_BPS = 50;
export const MIN_MARGIN_USD = 0.1;
export const MAX_MARGIN_USD = 100;
export const MIN_LEVERAGE = 1;
export const MAX_LEVERAGE = 10;
/** Min/max market slippage percent (matches app trade form). */
export const MIN_SLIPPAGE_PCT = 0.1;
export const MAX_SLIPPAGE_PCT = 50;
export const DEFAULT_MARKET_SLIPPAGE_PCT = 5;

export function marginUsdToQuoteAtoms(marginUsd: number): bigint {
  if (!Number.isFinite(marginUsd) || marginUsd <= 0) return 0n;
  return BigInt(Math.round(marginUsd * Number(QUOTE_UNIT)));
}

export function positionQuoteAtoms(marginAtoms: bigint, leverageBps: bigint): bigint {
  return (marginAtoms * leverageBps) / 10_000n;
}

export function maxMintBudgetAtoms(marginAtoms: bigint, leverageBps: bigint): bigint {
  const position = positionQuoteAtoms(marginAtoms, leverageBps);
  return (position * BigInt(10_000 - MINT_BUDGET_SAFETY_BPS)) / 10_000n;
}

export function estimateQuantity(
  marginAtoms: bigint,
  leverageBps: bigint,
  premiumPerUnit: bigint,
): bigint {
  if (premiumPerUnit <= 0n) return 1n;
  const budget = maxMintBudgetAtoms(marginAtoms, leverageBps);
  const qty = (budget * PREDICT_PRICE_SCALE) / premiumPerUnit;
  return qty > 0n ? qty : 1n;
}

export function applySlippageBps(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 + slippageBps)) / 10_000n;
}

export function costFromPremiumPerUnit(premiumPerUnit: bigint, quantity: bigint): bigint {
  if (premiumPerUnit <= 0n || quantity <= 0n) return 0n;
  return (premiumPerUnit * quantity) / PREDICT_PRICE_SCALE;
}

export function parseLeverageMultiplier(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase().replace(/x$/, '');
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value < MIN_LEVERAGE || value > MAX_LEVERAGE) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

export function parseSlippagePercent(raw: string | undefined | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const trimmed = raw.trim().toLowerCase().replace(/%$/, '');
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value < MIN_SLIPPAGE_PCT || value > MAX_SLIPPAGE_PCT) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function bpsToPercent(bps: number): number {
  return Math.round((bps / 100) * 10) / 10;
}

export function formatSlippagePercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export type TelegramTradeCommandArgs = {
  marginUsd: number;
  leverageRaw: string;
  slippagePct: number | null;
};

/** Parse `/up 10 4x` or `/up 0.1 1x 5%`. */
export function parseTelegramTradeCommand(text: string): TelegramTradeCommandArgs | null {
  const match = text.match(
    /^(?:\/up|\/down|\/range)(?:@\w+)?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?x?|\d+x)(?:\s+(\S+))?$/i,
  );
  if (!match) return null;

  const marginUsd = Number.parseFloat(match[1]!);
  if (!Number.isFinite(marginUsd)) return null;

  const slippageRaw = match[3]?.trim();
  if (slippageRaw != null && slippageRaw !== '' && parseSlippagePercent(slippageRaw) == null) {
    return null;
  }

  return {
    marginUsd,
    leverageRaw: match[2]!,
    slippagePct: parseSlippagePercent(slippageRaw),
  };
}

export function leverageMultiplierToBps(multiplier: number): bigint {
  return BigInt(Math.round(multiplier * 10_000));
}

export function toOracleStrikeRaw(value: number | undefined | null): number {
  if (value == null || value <= 0) return 0;
  return value < 1_000_000 ? Math.round(value * FLOAT_SCALING) : Math.round(value);
}

export function atmStrikeRaw(spotUsd: number, minStrikeRaw: number, tickSizeRaw: number): number {
  if (spotUsd <= 0) return minStrikeRaw > 0 ? minStrikeRaw : 0;
  const spotRaw = Math.round(spotUsd * FLOAT_SCALING);
  const tick = tickSizeRaw > 0 ? tickSizeRaw : minStrikeRaw;
  if (tick <= 0) return spotRaw;
  return Math.max(minStrikeRaw, Math.round(spotRaw / tick) * tick);
}

export function baseFromUnderlying(underlying: string | undefined): string {
  const asset = (underlying ?? '').trim().toUpperCase();
  if (asset.startsWith('D') && asset.length > 1) return asset.slice(1);
  return asset || '—';
}

export function formatTimeRemaining(expiryMs: number, now = Date.now()): string {
  const remaining = expiryMs - now;
  if (remaining <= 0) return 'closed';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

/** Human-readable leverage multiplier (e.g. 4 → "4x", 2.5 → "2.5x"). */
export function formatLeverageMultiplier(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}x` : `${rounded.toFixed(1)}x`;
}

/** Warning when requested leverage exceeds the time-graded cap for a market. */
export function formatLeverageTimeCapWarning(
  maxLeverage: number,
  requestedLeverage?: number,
): string {
  const maxLabel = formatLeverageMultiplier(maxLeverage);
  if (requestedLeverage != null && requestedLeverage > maxLeverage + 1e-6) {
    return (
      `Leverage ${formatLeverageMultiplier(requestedLeverage)} exceeds the time-graded cap ` +
      `for this market (max ${maxLabel} now). Lower leverage or pick a market with more time left.`
    );
  }
  return `Max leverage for this market right now: ${maxLabel} (time-graded by expiry).`;
}
