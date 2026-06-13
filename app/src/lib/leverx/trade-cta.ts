import type { PredictSide } from "@/lib/predict/instruments";

export type TradeOrderType = "market" | "limit";

const sideCtaLabel: Record<PredictSide, string> = {
  up: "Up",
  down: "Down",
  range: "Range",
};

export function tradeActionLabel(side: PredictSide, orderType: TradeOrderType): string {
  const sideLabel = sideCtaLabel[side];
  if (orderType === "limit") {
    return `Place ${sideLabel} limit`;
  }
  return `Open ${sideLabel}`;
}

export function tradeCtaLabel(args: {
  side: PredictSide;
  orderType: TradeOrderType;
  needsDeposit: boolean;
}): string {
  const action = tradeActionLabel(args.side, args.orderType);
  return args.needsDeposit ? `Deposit and ${action}` : action;
}

/** True when the wallet must fund the margin from the connected wallet balance. */
export function tradeNeedsDeposit(args: {
  marginUsd: number;
  walletQuoteBalance?: number | null;
}): boolean {
  if (args.marginUsd <= 0) return false;
  if (args.walletQuoteBalance == null) return false;
  return args.walletQuoteBalance + 1e-6 < args.marginUsd;
}
