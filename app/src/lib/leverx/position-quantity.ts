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

/** Whether a row should expose Manage (settle, withdraw, repay, recover, etc.). */
export function positionShowsManageAction(
  position: Pick<
    LeveragedPosition,
    "status" | "borrow_quote" | "action_hints" | "leverx_custody_complete" | "close_surplus_quote"
  >,
): boolean {
  if (position.status === "open") return true;
  if (coerceQuoteAtoms(position.borrow_quote) > 0) return true;
  if (position.action_hints?.needs_custody_recovery) return true;
  if (position.action_hints?.recommended_actions?.includes("recover_custody")) return true;
  if (position.action_hints?.recommended_actions?.includes("withdraw_trading")) return true;
  if (
    position.leverx_custody_complete &&
    coerceQuoteAtoms(position.close_surplus_quote) > 0
  ) {
    return true;
  }
  return false;
}
