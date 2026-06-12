import { FLOAT_SCALING, QUOTE_UNIT } from "@/lib/predict/constants";
import { PREDICT_PRICE_SCALE } from "@/lib/leverx/constants";
import { clampLeverage } from "@/lib/leverx/trade-limits";

/** DeepBook Predict per-oracle ask bounds (1e9 premium scale). */
export const PREDICT_MIN_ASK_PREMIUM = 10_000_000n;
export const PREDICT_MAX_ASK_PREMIUM = 990_000_000n;
export const PREDICT_MIN_PREMIUM_CENTS = 1;
export const PREDICT_MAX_PREMIUM_CENTS = 99;

export function isPremiumWithinPredictBounds(premium: bigint): boolean {
  return premium >= PREDICT_MIN_ASK_PREMIUM && premium <= PREDICT_MAX_ASK_PREMIUM;
}

export function isLimitCentsWithinPredictBounds(cents: number): boolean {
  if (!Number.isFinite(cents) || cents <= 0) return false;
  return cents >= PREDICT_MIN_PREMIUM_CENTS && cents <= PREDICT_MAX_PREMIUM_CENTS;
}

/** Total mint cost from per-contract premium (matches on-chain `cost_from_premium_per_unit`). */
export function costFromPremiumPerUnit(premiumPerUnit: bigint, quantity: bigint): bigint {
  if (premiumPerUnit <= 0n || quantity <= 0n) return 0n;
  return (premiumPerUnit * quantity) / PREDICT_PRICE_SCALE;
}

/** Classify a live per-contract ask returned from Predict (1e9 scale). */
export function classifyPredictPremium(
  premium: bigint,
): "ok" | "zero" | "expired" | "out_of_bounds" {
  if (premium <= 0n) return "zero";
  if (premium >= PREDICT_PRICE_SCALE) return "expired";
  if (!isPremiumWithinPredictBounds(premium)) return "out_of_bounds";
  return "ok";
}

/** USD margin → quote atoms (6-decimal dUSDC). */
export function marginUsdToQuoteAtoms(marginUsd: number): bigint {
  if (!Number.isFinite(marginUsd) || marginUsd <= 0) return 0n;
  return BigInt(Math.round(marginUsd * Number(QUOTE_UNIT)));
}

/** Leverage multiplier → basis points (2x → 20_000). */
export function leverageToBps(leverage: number): bigint {
  return BigInt(Math.round(clampLeverage(leverage) * 10_000));
}

/** Percent → basis points. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** Display cents → Predict premium per unit (1e9 scale). */
export function centsToPremiumRaw(cents: number): bigint {
  if (!Number.isFinite(cents) || cents <= 0) return 0n;
  return BigInt(Math.round((cents / 100) * Number(FLOAT_SCALING)));
}

/** Premium raw → display cents. */
export function premiumRawToCents(premium: bigint): number {
  return (Number(premium) / Number(FLOAT_SCALING)) * 100;
}

/** USD strike → raw 1e9 units. */
export function strikeUsdToRaw(strikeUsd: number): number {
  if (!Number.isFinite(strikeUsd) || strikeUsd <= 0) return 0;
  return Math.round(strikeUsd * Number(FLOAT_SCALING));
}

export function positionQuoteAtoms(marginAtoms: bigint, leverageBps: bigint): bigint {
  return (marginAtoms * leverageBps) / 10_000n;
}

export function borrowQuoteAtoms(marginAtoms: bigint, leverageBps: bigint): bigint {
  const position = positionQuoteAtoms(marginAtoms, leverageBps);
  return position > marginAtoms ? position - marginAtoms : 0n;
}

/** Estimate contract quantity from margin and per-unit premium. */
export function estimateQuantity(
  marginAtoms: bigint,
  leverageBps: bigint,
  premiumPerUnit: bigint,
): bigint {
  if (premiumPerUnit <= 0n) return 1n;
  const position = positionQuoteAtoms(marginAtoms, leverageBps);
  const qty = (position * PREDICT_PRICE_SCALE) / premiumPerUnit;
  return qty > 0n ? qty : 1n;
}

export function applySlippageBps(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 + slippageBps)) / 10_000n;
}

/** Map TP/SL UI value to on-chain premium (1e9 scale). */
export function tpSlToPremiumRaw(args: {
  value: number;
  unit: "pct" | "cents";
  entryPremiumRaw: bigint;
  isTakeProfit: boolean;
}): bigint {
  const { value, unit, entryPremiumRaw, isTakeProfit } = args;
  if (!Number.isFinite(value) || value <= 0 || entryPremiumRaw <= 0n) return 0n;

  if (unit === "cents") {
    return centsToPremiumRaw(value);
  }

  const factor = isTakeProfit ? 1 + value / 100 : 1 - value / 100;
  if (factor <= 0) return 0n;
  return BigInt(Math.round(Number(entryPremiumRaw) * factor));
}
