import type { LeveragedPosition } from "@/lib/leverx/indexer-client";

/** `null` = on-chain read failed; `0n` = read succeeded with no contracts. */
export type OnChainQuantityRead = bigint | null;

/** Quantity to use for post-expiry settlement (matches keeper: indexer fallback). */
export function settleContractQuantity(
  onChain: OnChainQuantityRead,
  position: Pick<LeveragedPosition, "open_quantity">,
): bigint {
  if (onChain != null && onChain > 0n) return onChain;
  if (position.open_quantity > 0) return BigInt(position.open_quantity);
  return onChain ?? 0n;
}

export function hasIndexerOpenQuantity(position: Pick<LeveragedPosition, "open_quantity">): boolean {
  return position.open_quantity > 0;
}
