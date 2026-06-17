import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import {
  hasIndexerOpenQuantity,
  settleContractQuantity,
  type OnChainQuantityRead,
} from "@/lib/leverx/position-quantity";

export type PositionEmptyStateKind =
  | "index_stale"
  | "fully_redeemed"
  | "awaiting_oracle_settlement"
  | "no_actions";

export type PositionActionAvailability = {
  canCloseRedeem: boolean;
  canSettle: boolean;
  canRepayDebt: boolean;
  emptyState: PositionEmptyStateKind | null;
};

/** Portfolio index lists open qty but on-chain manager position is flat. */
export function isIndexerStaleOpenPosition(
  position: Pick<LeveragedPosition, "status" | "open_quantity">,
  onChainQuantity: OnChainQuantityRead,
): boolean {
  return (
    position.status === "open" &&
    onChainQuantity === 0n &&
    hasIndexerOpenQuantity(position)
  );
}

/** Which manage actions are valid for this position (on-chain qty + oracle state). */
export function getPositionActionAvailability(params: {
  position: LeveragedPosition;
  onChainQuantity: OnChainQuantityRead;
  quantityLoading: boolean;
  oracleSettled: boolean;
  now?: number;
}): PositionActionAvailability {
  const { position, onChainQuantity, quantityLoading, oracleSettled } = params;
  const now = params.now ?? Date.now();
  const expired = position.expiry_ms > 0 && position.expiry_ms < now;
  const hasDebt = position.borrow_quote > 0;

  const settleQty = settleContractQuantity(onChainQuantity);
  const hasRedeemableQuantity =
    onChainQuantity != null
      ? onChainQuantity > 0n
      : hasIndexerOpenQuantity(position);

  const canCloseRedeem = hasRedeemableQuantity && !oracleSettled;
  const canSettle =
    expired &&
    oracleSettled &&
    settleQty > 0n &&
    !quantityLoading &&
    onChainQuantity != null;
  const canRepayDebt = hasDebt;

  let emptyState: PositionEmptyStateKind | null = null;
  if (!quantityLoading && !canCloseRedeem && !canSettle && !canRepayDebt) {
    if (isIndexerStaleOpenPosition(position, onChainQuantity)) {
      emptyState = "index_stale";
    } else if (settleQty === 0n && !hasIndexerOpenQuantity(position)) {
      emptyState = "fully_redeemed";
    } else if (expired && !oracleSettled && hasIndexerOpenQuantity(position)) {
      emptyState = "awaiting_oracle_settlement";
    } else {
      emptyState = "no_actions";
    }
  }

  return {
    canCloseRedeem,
    canSettle,
    canRepayDebt,
    emptyState,
  };
}
