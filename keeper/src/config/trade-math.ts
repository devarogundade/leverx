import { PREDICT_PRICE_SCALE } from './constants';

export function redeemPayoutFromBid(bidPerUnit: bigint, quantity: bigint): bigint {
  return (bidPerUnit * quantity) / PREDICT_PRICE_SCALE;
}

export function minPayoutAfterSlippage(expectedPayout: bigint, slippageBps: number): bigint {
  const floor = 10_000n - BigInt(slippageBps);
  return (expectedPayout * floor) / 10_000n;
}

/**
 * Vault flash principal for liquidation PTBs.
 * Uses vault debt when present; otherwise falls back to posted margin debt.
 */
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
