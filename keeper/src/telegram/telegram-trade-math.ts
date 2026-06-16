/** Telegram bot trade sizing — mirrors app trade-math (dUSDC + Predict 1e9 premium scale). */

export const QUOTE_UNIT = 1_000_000n;
export const PREDICT_PRICE_SCALE = 1_000_000_000n;
export const FLOAT_SCALING = 1_000_000_000;
export const MINT_BUDGET_SAFETY_BPS = 50;
export const MIN_MARGIN_USD = 0.1;
export const MAX_MARGIN_USD = 100;
export const MIN_LEVERAGE = 1;
export const MAX_LEVERAGE = 10;

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
