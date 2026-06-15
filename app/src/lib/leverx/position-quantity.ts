import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { coerceQuoteAtoms } from "@/lib/predict/scaling";

/** `null` = on-chain read failed; `0n` = read succeeded with no contracts. */
export type OnChainQuantityRead = bigint | null;

/** Quantity to use for post-expiry settlement — on-chain only (never indexer fallback). */
export function settleContractQuantity(onChain: OnChainQuantityRead): bigint {
  return onChain ?? 0n;
}

export function hasIndexerOpenQuantity(position: Pick<LeveragedPosition, "open_quantity">): boolean {
  return coerceQuoteAtoms(position.open_quantity) > 0;
}

/** Whether a row should expose Manage (settle, withdraw, repay, etc.). */
export function positionShowsManageAction(
  position: Pick<LeveragedPosition, "status" | "borrow_quote" | "predict_manager_id">,
): boolean {
  if (position.status === "open") return true;
  return Boolean(position.predict_manager_id) || coerceQuoteAtoms(position.borrow_quote) > 0;
}
