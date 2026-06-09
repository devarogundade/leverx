import { PREDICT_PRICE_SCALE } from './constants';

export function redeemPayoutFromBid(bidPerUnit: bigint, quantity: bigint): bigint {
  return (bidPerUnit * quantity) / PREDICT_PRICE_SCALE;
}

export function minPayoutAfterSlippage(expectedPayout: bigint, slippageBps: number): bigint {
  const floor = 10_000n - BigInt(slippageBps);
  return (expectedPayout * floor) / 10_000n;
}
