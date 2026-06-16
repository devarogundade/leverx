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
  if (args.needsDeposit) {
    return "Deposit funds to trade";
  }
  return tradeActionLabel(args.side, args.orderType);
}

/** True when the chosen source must fund the margin before the trade can open. */
export function tradeNeedsDeposit(args: {
  marginUsd: number;
  availableQuoteBalance?: number | null;
  walletQuoteBalance?: number | null;
}): boolean {
  const available =
    args.availableQuoteBalance ?? args.walletQuoteBalance ?? null;
  if (args.marginUsd <= 0) return false;
  if (available == null) return false;
  return available + 1e-6 < args.marginUsd;
}
