import type { LeveragedPosition, PositionEmptyStateKind } from "@/lib/leverx/indexer-client";
import { coerceQuoteAtoms } from "@/lib/predict/scaling";
import {
  hasIndexerOpenQuantity,
  settleContractQuantity,
  type OnChainQuantityRead,
} from "@/lib/leverx/position-quantity";

export type { PositionEmptyStateKind };

export type PositionCustodyRead = {
  keyQuoteBalance: bigint | null;
  managerQuoteBalance: bigint | null;
  custodyLoading: boolean;
};

export type PositionActionAvailability = {
  canCloseRedeem: boolean;
  canSettle: boolean;
  canRepayDebt: boolean;
  canRecoverCustody: boolean;
  recoverKeyQuote: bigint;
  recoverManagerQuote: bigint;
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

function flatOnChain(onChainQuantity: OnChainQuantityRead, quantityLoading: boolean): boolean {
  return !quantityLoading && onChainQuantity === 0n;
}

/** Which manage actions are valid for this position (on-chain qty + oracle state). */
export function getPositionActionAvailability(params: {
  position: LeveragedPosition;
  onChainQuantity: OnChainQuantityRead;
  quantityLoading: boolean;
  oracleSettled: boolean;
  custody?: PositionCustodyRead;
  now?: number;
}): PositionActionAvailability {
  const { position, onChainQuantity, quantityLoading, oracleSettled, custody } = params;
  const now = params.now ?? Date.now();
  const expired = position.expiry_ms > 0 && position.expiry_ms < now;
  const hasDebt = coerceQuoteAtoms(position.borrow_quote) > 0;

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

  const custodyReady = custody != null && !custody.custodyLoading;
  const keyQuote = custodyReady ? (custody.keyQuoteBalance ?? 0n) : 0n;
  const managerQuote = custodyReady ? (custody.managerQuoteBalance ?? 0n) : 0n;
  const canRecoverKeyCustody =
    flatOnChain(onChainQuantity, quantityLoading) && !hasDebt && keyQuote > 0n;
  const canRecoverManagerSurplus =
    flatOnChain(onChainQuantity, quantityLoading) && !hasDebt && managerQuote > 0n;

  const hints = position.action_hints;
  const indexerNeedsRecovery = hints?.needs_custody_recovery ?? false;
  const indexerRecoverHint =
    indexerNeedsRecovery ||
    (hints?.recommended_actions?.includes("recover_custody") ?? false) ||
    (coerceQuoteAtoms(position.external_redeem_payout_quote ?? 0) > 0 &&
      position.leverx_custody_complete === false);

  const canRecoverFromIndexerHint =
    indexerRecoverHint &&
    flatOnChain(onChainQuantity, quantityLoading) &&
    !hasDebt &&
    !custodyReady;

  const canRecoverCustody =
    canRecoverKeyCustody || canRecoverManagerSurplus || canRecoverFromIndexerHint;

  let emptyState: PositionEmptyStateKind | null = null;
  if (
    !quantityLoading &&
    !canCloseRedeem &&
    !canSettle &&
    !canRepayDebt &&
    !canRecoverCustody
  ) {
    if (isIndexerStaleOpenPosition(position, onChainQuantity)) {
      emptyState = hints?.empty_state_hint ?? "index_stale";
    } else if (hints?.empty_state_hint) {
      emptyState = hints.empty_state_hint;
    } else if (position.status !== "open" && settleQty === 0n) {
      emptyState = "fully_redeemed";
    } else if (settleQty === 0n && !hasIndexerOpenQuantity(position)) {
      emptyState = "fully_redeemed";
    } else if (expired && !oracleSettled && hasIndexerOpenQuantity(position)) {
      emptyState = "awaiting_oracle_settlement";
    } else {
      emptyState = "no_actions";
    }
  } else if (
    canRecoverCustody &&
    !canCloseRedeem &&
    !canSettle &&
    !canRepayDebt
  ) {
    emptyState = "stranded_custody";
  }

  return {
    canCloseRedeem,
    canSettle,
    canRepayDebt,
    canRecoverCustody,
    recoverKeyQuote: canRecoverKeyCustody ? keyQuote : 0n,
    recoverManagerQuote: canRecoverManagerSurplus ? managerQuote : 0n,
    emptyState,
  };
}
