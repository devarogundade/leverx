import type { LeveragedPosition } from "@/lib/leverx/indexer-client";

/** `null` = on-chain read failed; `0n` = read succeeded with no contracts. */
export type OnChainQuantityRead = bigint | null;

/** Quantity to use for post-expiry settlement. Indexer fallback only when on-chain read failed. */
export function settleContractQuantity(
  onChain: OnChainQuantityRead,
  position: Pick<LeveragedPosition, "open_quantity">,
): bigint {
  if (onChain != null) return onChain;
  if (position.open_quantity > 0) return BigInt(position.open_quantity);
  return 0n;
}

export function hasIndexerOpenQuantity(position: Pick<LeveragedPosition, "open_quantity">): boolean {
  return position.open_quantity > 0;
}
