import { MIN_LEVERAGE_BPS, PREDICT_PRICE_SCALE } from './constants';

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
} {
  const timeToExpiryMs = expiryMs > now ? expiryMs - now : 0;
  const inFinalWindow = isFinalHourBeforeExpiry(expiryMs, now, windowMs);
  const finalWindowStartMs = expiryMs - windowMs;
  const msUntilFinalWindow = inFinalWindow ? 0 : Math.max(0, finalWindowStartMs - now);

  return {
    final_window_ms: windowMs,
    in_final_window: inFinalWindow,
    time_to_expiry_ms: timeToExpiryMs,
    time_to_expiry_hours: timeToExpiryMs / (60 * 60 * 1000),
    hours_until_final_window: msUntilFinalWindow / (60 * 60 * 1000),
    leveraged_mint_blocked: isLeveragedMintBlocked(expiryMs, now, windowMs),
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
