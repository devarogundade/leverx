import type { PredictSide } from "@/lib/predict/instruments";
import { QUOTE_UNIT } from "@/lib/predict/constants";
import type { CollateralRoute, LeverxProtocolConfig } from "@/lib/leverx/protocol";
import {
  borrowQuoteAtoms,
  collateralAtomsFromQuoteValue,
  collateralQuoteValueForBorrow,
  leverageToBps,
  marginUsdToQuoteAtoms,
} from "@/lib/leverx/trade-math";

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

export function computeRequiredCollateralDepositAtoms(args: {
  route: CollateralRoute;
  cfg: LeverxProtocolConfig;
  marginUsd: number;
  leverage: number;
  collateralSpotUsd?: number;
}): bigint {
  const marginAtoms = marginUsdToQuoteAtoms(args.marginUsd);
  const borrowAtoms = borrowQuoteAtoms(marginAtoms, leverageToBps(args.leverage));
  if (borrowAtoms <= 0n) return 0n;

  const quoteValue = collateralQuoteValueForBorrow(borrowAtoms, args.route.maxLtvBps);
  if (args.route.coinType === args.cfg.quoteType) {
    return quoteValue;
  }
  if (!args.collateralSpotUsd || args.collateralSpotUsd <= 0) return 0n;
  return collateralAtomsFromQuoteValue(
    quoteValue,
    args.collateralSpotUsd,
    args.route.decimals,
  );
}

/** True when the wallet tx must fund collateral and/or margin deposits. */
export function tradeNeedsDeposit(args: {
  marginUsd: number;
  leverage: number;
  route: CollateralRoute | null | undefined;
  cfg: LeverxProtocolConfig | null | undefined;
  collateralSpotUsd?: number;
  depositedCollateralAtoms: bigint;
  walletCollateralBalance?: number | null;
  walletQuoteBalance?: number | null;
}): boolean {
  if (args.marginUsd <= 0 || !args.route || !args.cfg) return false;

  const requiredCollateral = computeRequiredCollateralDepositAtoms({
    route: args.route,
    cfg: args.cfg,
    marginUsd: args.marginUsd,
    leverage: args.leverage,
    collateralSpotUsd: args.collateralSpotUsd,
  });

  if (requiredCollateral > args.depositedCollateralAtoms) {
    return true;
  }

  const sameCoin = args.route.coinType === args.cfg.quoteType;
  const collateralShortfallAtoms =
    requiredCollateral > args.depositedCollateralAtoms
      ? requiredCollateral - args.depositedCollateralAtoms
      : 0n;

  const quoteNeededUsd =
    args.marginUsd +
    (sameCoin ? Number(collateralShortfallAtoms) / Number(QUOTE_UNIT) : 0);

  if (
    args.walletQuoteBalance != null &&
    args.walletQuoteBalance + 1e-6 < quoteNeededUsd
  ) {
    return true;
  }

  if (
    !sameCoin &&
    collateralShortfallAtoms > 0n &&
    args.walletCollateralBalance != null
  ) {
    const shortfallHuman =
      Number(collateralShortfallAtoms) / 10 ** args.route.decimals;
    if (args.walletCollateralBalance + 1e-9 < shortfallHuman) {
      return true;
    }
  }

  return false;
}
