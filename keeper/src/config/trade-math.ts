import {
  DEFAULT_FINAL_WINDOW_MS,
  LEVERAGED_MINT_WINDOW_MS,
  MIN_LEVERAGE_BPS,
  PREDICT_PRICE_SCALE,
} from './constants';

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
  now = Date.now(),
  windowMs = DEFAULT_FINAL_WINDOW_MS,
): boolean {
  if (!expiryMs || expiryMs <= 0) return false;
  return expiryMs > now && expiryMs - windowMs <= now;
}

/** Matches on-chain `assert_leveraged_mint_window` for leverage above 1x. */
export function isLeveragedMintAllowed(
  expiryMs: number,
  leverageBps: number,
  now = Date.now(),
  windowMs = DEFAULT_FINAL_WINDOW_MS,
): boolean {
  if (leverageBps <= MIN_LEVERAGE_BPS) return true;
  if (!expiryMs || expiryMs <= 0) return false;
  return now < expiryMs - windowMs;
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
