import type { PredictSide } from "@/lib/predict/instruments";
import { marginUsdToQuoteAtoms } from "@/lib/leverx/trade-math";

export type TradeOrderType = "market" | "limit";

const sideCtaLabel: Record<PredictSide, string> = {
  up: "Up",
  down: "Down",
  range: "Range",
};

export function tradeActionLabel(
  side: PredictSide,
  orderType: TradeOrderType,
): string {
  const sideLabel = sideCtaLabel[side];
  if (orderType === "limit") return `Place ${sideLabel} limit`;
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

/** True when the wallet tx must fund dUSDC margin deposit. */
export function tradeNeedsDeposit(args: {
  marginUsd: number;
  depositedQuoteAtoms: bigint;
  walletQuoteBalance?: number | null;
}): boolean {
  if (args.marginUsd <= 0) return false;

  const marginAtoms = marginUsdToQuoteAtoms(args.marginUsd);
  if (marginAtoms > args.depositedQuoteAtoms) {
    return true;
  }

  if (args.walletQuoteBalance != null && args.walletQuoteBalance + 1e-6 < args.marginUsd) {
    return true;
  }

  return false;
}
