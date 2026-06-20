import { MAX_LEVERAGE_BPS, MIN_LEVERAGE_BPS, MINT_BUDGET_SAFETY_BPS, PREDICT_PRICE_SCALE } from './constants';

const LEVERAGE_MAX = MAX_LEVERAGE_BPS / 10_000;
const LEVERAGE_MIN = MIN_LEVERAGE_BPS / 10_000;

export function applySlippageBps(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 + slippageBps)) / 10_000n;
}

export function positionQuoteAtoms(marginAtoms: bigint, leverageBps: bigint): bigint {
  return (marginAtoms * leverageBps) / 10_000n;
}

/** Max mint spend: leveraged position minus a small on-chain safety buffer. */
export function maxMintBudgetAtoms(marginAtoms: bigint, leverageBps: bigint): bigint {
  const position = positionQuoteAtoms(marginAtoms, leverageBps);
  return (position * BigInt(10_000 - MINT_BUDGET_SAFETY_BPS)) / 10_000n;
}

/** Estimate contract quantity from margin and per-unit premium (linear; verify on-chain). */
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

export function costFromPremiumPerUnit(premiumPerUnit: bigint, quantity: bigint): bigint {
  if (premiumPerUnit <= 0n || quantity <= 0n) return 0n;
  return (premiumPerUnit * quantity) / PREDICT_PRICE_SCALE;
}

/** Slippage cap bounded by on-chain funding (margin + borrow). */
export function capMaxMintCost(
  mintCost: bigint,
  slippageBps: number,
  marginAtoms: bigint,
  leverageBps: bigint,
  borrowQuote = 0n,
): bigint {
  const slippageCap = applySlippageBps(mintCost, slippageBps);
  const fundingCap = marginAtoms + borrowQuote;
  return slippageCap < fundingCap ? slippageCap : fundingCap;
}

export function redeemPayoutFromBid(bidPerUnit: bigint, quantity: bigint): bigint {
  return (bidPerUnit * quantity) / PREDICT_PRICE_SCALE;
}

export function minPayoutAfterSlippage(expectedPayout: bigint, slippageBps: number): bigint {
  const floor = 10_000n - BigInt(slippageBps);
  return (expectedPayout * floor) / 10_000n;
}

/** Matches on-chain final-window gate: [expiry - window, expiry). */
export function isFinalHourBeforeExpiry(
  expiryMs: number,
  now: number,
  windowMs: number,
): boolean {
  if (!expiryMs || expiryMs <= 0) return false;
  return expiryMs > now && expiryMs - windowMs <= now;
}

/** Matches on-chain `assert_leveraged_mint_window` for leverage above 1x. */
export function isLeveragedMintAllowed(
  expiryMs: number,
  leverageBps: number,
  now: number,
  windowMs: number,
): boolean {
  if (leverageBps <= MIN_LEVERAGE_BPS) return true;
  if (!expiryMs || expiryMs <= 0) return false;
  return now < expiryMs - windowMs;
}

/** True when any leverage above 1× is blocked for new mints (final window or past expiry). */
export function isLeveragedMintBlocked(
  expiryMs: number,
  now: number,
  windowMs: number,
): boolean {
  return !isLeveragedMintAllowed(expiryMs, MIN_LEVERAGE_BPS + 1, now, windowMs);
}

/** Timestamp when leveraged mints (>1×) close: expiry − final_window_ms. */
export function leverageClosesAtMs(expiryMs: number, windowMs: number): number {
  if (!expiryMs || expiryMs <= 0) return 0;
  return expiryMs - windowMs;
}

/**
 * Recommended max leverage from time remaining (matches app UI policy):
 * floor(time_to_expiry / final_window_ms) capped at 10×, minimum 1×.
 * On-chain only blocks >1× inside the final window; this tiers 2×, 3×, … earlier.
 */
export function maxLeverageForExpiry(
  expiryMs: number,
  now: number,
  windowMs: number,
  leverageMax = LEVERAGE_MAX,
): number {
  if (!expiryMs || expiryMs <= 0) return leverageMax;
  if (!windowMs || windowMs <= 0) return leverageMax;

  const remainingMs = Math.max(0, expiryMs - now);
  if (remainingMs <= 0) return LEVERAGE_MIN;

  const windowUnits = Math.floor(remainingMs / windowMs);
  return Math.min(leverageMax, Math.max(LEVERAGE_MIN, windowUnits));
}

/** Runtime final-window fields aligned with on-chain `[expiry - window, expiry)`. */
export function computeFinalWindowContext(
  expiryMs: number,
  now: number,
  windowMs: number,
): {
  final_window_ms: number;
  in_final_window: boolean;
  time_to_expiry_ms: number;
  time_to_expiry_hours: number;
  hours_until_final_window: number;
  leveraged_mint_blocked: boolean;
  final_window_periods_remaining: number;
  max_leverage_for_time: number;
  leverage_closes_at_ms: number;
  ms_until_leverage_closes: number;
} {
  const timeToExpiryMs = expiryMs > now ? expiryMs - now : 0;
  const inFinalWindow = isFinalHourBeforeExpiry(expiryMs, now, windowMs);
  const finalWindowStartMs = expiryMs - windowMs;
  const msUntilFinalWindow = inFinalWindow ? 0 : Math.max(0, finalWindowStartMs - now);
  const leverageClosesAt = leverageClosesAtMs(expiryMs, windowMs);
  const msUntilLeverageCloses = Math.max(0, leverageClosesAt - now);
  const finalWindowPeriodsRemaining =
    timeToExpiryMs > 0 && windowMs > 0 ? Math.floor(timeToExpiryMs / windowMs) : 0;

  return {
    final_window_ms: windowMs,
    in_final_window: inFinalWindow,
    time_to_expiry_ms: timeToExpiryMs,
    time_to_expiry_hours: timeToExpiryMs / (60 * 60 * 1000),
    hours_until_final_window: msUntilFinalWindow / (60 * 60 * 1000),
    leveraged_mint_blocked: isLeveragedMintBlocked(expiryMs, now, windowMs),
    final_window_periods_remaining: finalWindowPeriodsRemaining,
    max_leverage_for_time: maxLeverageForExpiry(expiryMs, now, windowMs),
    leverage_closes_at_ms: leverageClosesAt,
    ms_until_leverage_closes: msUntilLeverageCloses,
  };
}

/**
 * Vault flash principal for liquidation PTBs.
 * Uses vault debt when present; otherwise falls back to posted margin debt.
 */

/** Position has vault borrow and/or posted margin debt eligible for liquidation. */
export function hasLiquidationDebt(
  borrowQuote: number | string,
  marginQuote: number | string,
): boolean {
  return BigInt(borrowQuote || 0) > 0n || BigInt(marginQuote || 0) > 0n;
}

export function flashBorrowAmountForLiquidation(
  borrowQuote: number | string,
  marginQuote: number | string,
  bufferBps: number,
): bigint {
  const vaultDebt = BigInt(borrowQuote || 0);
  const marginDebt = BigInt(marginQuote || 0);
  const principal = vaultDebt > 0n ? vaultDebt : marginDebt;
  if (principal === 0n) return 1n;
  return principal + (principal * BigInt(bufferBps)) / 10_000n;
}
