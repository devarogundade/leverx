import type { RedeemQuote } from "@/lib/leverx/quotes";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { DEFAULT_LIQUIDATION_BPS } from "@/lib/leverx/protocol";
import { PREDICT_PRICE_SCALE } from "@/lib/leverx/constants";
import { premiumRawToCents, premiumPerUnitFromMintCost } from "@/lib/leverx/trade-math";
import { scaleQuote } from "@/lib/predict/scaling";

export type PositionMarkToMarket = {
  positionKey: string;
  markValueUsd: number;
  markBidPerUnit: number | null;
  markBidCents: number | null;
  entryCostUsd: number;
  entryPremiumPerUnit: number | null;
  entryPremiumCents: number | null;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number | null;
  netEquityUsd: number;
  healthBps: number | null;
  healthLabel: "healthy" | "margin_call" | "at_risk" | "unknown";
  isLive: boolean;
};

export function positionRowId(position: LeveragedPosition): string {
  return `${position.position_key}-${position.account_id}`;
}

/** Open indexer rows with zero quantity are stale keys — not live positions. */
export function isActiveOpenPosition(position: LeveragedPosition): boolean {
  return position.status === "open" && position.open_quantity > 0;
}

export function isEndedPosition(position: LeveragedPosition): boolean {
  return position.status !== "open";
}

export function closePrincipalRepaidAtoms(position: LeveragedPosition): number {
  return Math.max(0, position.close_debt_repaid - position.close_interest_paid);
}

/** Peak vault borrow on this key (set at open / max over life). */
export function effectivePeakBorrowAtoms(position: LeveragedPosition): number {
  const peak = position.peak_borrow_quote ?? 0;
  if (peak > 0) return peak;
  const closePrincipal = closePrincipalRepaidAtoms(position);
  const mintFundedBorrow = Math.max(0, position.mint_cost - position.margin_quote);
  return Math.max(position.borrow_quote, closePrincipal, mintFundedBorrow);
}

/** Wallet cash sent to repay vault debt before/during close (excludes borrow repaid from redeem). */
export function walletRepaidPrincipalAtoms(position: LeveragedPosition): number {
  const peakBorrow = effectivePeakBorrowAtoms(position);
  if (peakBorrow <= 0) return 0;
  if (isEndedPosition(position)) {
    return Math.max(0, peakBorrow - closePrincipalRepaidAtoms(position));
  }
  return Math.max(0, peakBorrow - position.borrow_quote);
}

export function walletRepaidPrincipalUsd(position: LeveragedPosition): number {
  return scaleQuote(walletRepaidPrincipalAtoms(position));
}

export function positionCashInUsd(position: LeveragedPosition): number {
  return positionMarginUsd(position) + walletRepaidPrincipalUsd(position);
}

/** Realized P&L for closed/settled/liquidated rows — net wallet result. */
export function realizedPnlUsd(position: LeveragedPosition): number | null {
  if (!isEndedPosition(position)) return null;
  if (hasClosePnlBreakdown(position)) {
    return (
      scaleQuote(position.close_surplus_quote) -
      positionMarginUsd(position) -
      walletRepaidPrincipalUsd(position)
    );
  }
  const payoutUsd = scaleQuote(position.realized_payout);
  const costUsd = scaleQuote(effectiveMintCostAtoms(position));
  return payoutUsd - costUsd;
}

export type ClosedPositionPnlBreakdown = {
  marginPostedUsd: number;
  walletRepaidUsd: number;
  cashBackUsd: number;
  borrowRepaidUsd: number;
  interestPaidUsd: number;
  netPnlUsd: number;
  hasBreakdown: boolean;
};

export function hasClosePnlBreakdown(position: LeveragedPosition): boolean {
  return (
    isEndedPosition(position) &&
    (position.close_debt_repaid > 0 ||
      position.close_interest_paid > 0 ||
      position.close_surplus_quote > 0)
  );
}

export function closedPositionPnlBreakdown(
  position: LeveragedPosition,
): ClosedPositionPnlBreakdown | null {
  if (!isEndedPosition(position)) return null;
  const hasBreakdown = hasClosePnlBreakdown(position);
  const marginPostedUsd = positionMarginUsd(position);
  const walletRepaidUsd = walletRepaidPrincipalUsd(position);
  const cashBackUsd = scaleQuote(position.close_surplus_quote);
  const borrowRepaidUsd = scaleQuote(closePrincipalRepaidAtoms(position));
  const interestPaidUsd = scaleQuote(position.close_interest_paid);
  const netPnlUsd = hasBreakdown
    ? cashBackUsd - marginPostedUsd - walletRepaidUsd
    : (realizedPnlUsd(position) ?? 0);
  return {
    marginPostedUsd,
    walletRepaidUsd,
    cashBackUsd,
    borrowRepaidUsd,
    interestPaidUsd,
    netPnlUsd,
    hasBreakdown,
  };
}

export function entryMarkPremiumRaw(position: LeveragedPosition): bigint | null {
  const fromCost = entryPremiumPerUnitRaw(position);
  if (fromCost != null) return fromCost;
  if (position.entry_mark != null && position.entry_mark > 0) {
    return BigInt(position.entry_mark);
  }
  return null;
}

export function closingMarkPremiumRaw(position: LeveragedPosition): bigint | null {
  if (
    isEndedPosition(position) &&
    position.realized_payout > 0 &&
    position.open_quantity > 0
  ) {
    return premiumPerUnitFromMintCost(
      BigInt(position.realized_payout),
      BigInt(position.open_quantity),
    );
  }
  if (position.closing_mark != null && position.closing_mark > 0) {
    return BigInt(position.closing_mark);
  }
  return null;
}

export function realizedPnlPct(position: LeveragedPosition): number | null {
  const pnlUsd = realizedPnlUsd(position);
  const basisUsd = hasClosePnlBreakdown(position)
    ? positionCashInUsd(position)
    : scaleQuote(effectiveMintCostAtoms(position));
  if (pnlUsd == null || basisUsd <= 0) return null;
  return (pnlUsd / basisUsd) * 100;
}

export function closedEntryPremiumCents(position: LeveragedPosition): number | null {
  const premium = entryMarkPremiumRaw(position);
  return premium != null ? premiumRawToCents(premium) : null;
}

export function closedClosingPremiumCents(position: LeveragedPosition): number | null {
  const premium = closingMarkPremiumRaw(position);
  return premium != null ? premiumRawToCents(premium) : null;
}

/** Cap ghost mint_cost until indexer migration repairs historical rows. */
export function effectiveMintCostAtoms(position: LeveragedPosition): number {
  if (position.mint_cost <= 0) return 0;
  // Closed rows zero borrow_quote; use full mint_cost for entry premium and P&L basis.
  if (isEndedPosition(position)) return position.mint_cost;
  const cap = position.margin_quote + position.borrow_quote;
  return cap > 0 ? Math.min(position.mint_cost, cap) : position.mint_cost;
}

/** Matches on-chain `ltv::effective_health_debt` (quote atoms). */
export function effectiveHealthDebtAtoms(
  vaultDebtAtoms: number,
  marginDebtAtoms: number,
  leverageBps: number,
): number {
  if (leverageBps <= 10_000) return 0;
  if (vaultDebtAtoms > 0) return vaultDebtAtoms;
  return marginDebtAtoms;
}

function effectiveHealthDebtUsd(
  vaultDebtUsd: number,
  marginDebtUsd: number,
  leverageBps: number,
): number {
  if (leverageBps <= 10_000) return 0;
  if (vaultDebtUsd > 0) return vaultDebtUsd;
  return marginDebtUsd;
}

/** Average fill premium — always mint_cost ÷ qty (unchanged by repay / deleverage). */
export function entryPremiumPerUnitRaw(position: LeveragedPosition): bigint | null {
  if (position.open_quantity <= 0 || position.mint_cost <= 0) return null;
  return premiumPerUnitFromMintCost(
    BigInt(position.mint_cost),
    BigInt(position.open_quantity),
  );
}

export function positionMintCostUsd(position: LeveragedPosition): number {
  return scaleQuote(position.mint_cost);
}

export function positionMarginUsd(position: LeveragedPosition): number {
  return scaleQuote(position.margin_quote);
}

export function positionBorrowUsd(position: LeveragedPosition): number {
  return scaleQuote(position.borrow_quote);
}

export function positionLeverageMultiplier(position: LeveragedPosition): number {
  return position.leverage_bps / 10_000;
}

export function computePositionMarkToMarket(
  position: LeveragedPosition,
  redeemQuote: RedeemQuote | null | undefined,
  quoteLoading: boolean,
  liquidationBps: number = DEFAULT_LIQUIDATION_BPS,
): PositionMarkToMarket {
  const entryCostUsd = scaleQuote(position.mint_cost);
  const marginUsd = scaleQuote(position.margin_quote);
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const positionSizeUsd = marginUsd + borrowedUsd;

  const entryPremium = entryMarkPremiumRaw(position);
  const entryPremiumCents = entryPremium != null ? premiumRawToCents(entryPremium) : null;

  if (!redeemQuote || position.open_quantity <= 0) {
    return {
      positionKey: positionRowId(position),
      markValueUsd: 0,
      markBidPerUnit: null,
      markBidCents: null,
      entryCostUsd,
      entryPremiumPerUnit: entryPremium != null ? Number(entryPremium) : null,
      entryPremiumCents,
      unrealizedPnlUsd: 0,
      unrealizedPnlPct: null,
      netEquityUsd: 0,
      healthBps: null,
      healthLabel: quoteLoading ? "unknown" : "unknown",
      isLive: false,
    };
  }

  const markValueUsd = scaleQuote(Number(redeemQuote.expectedPayout));
  const netEquityUsd = markValueUsd - borrowedUsd;
  const walletRepaidUsd = walletRepaidPrincipalUsd(position);
  const unrealizedPnlUsd = netEquityUsd - marginUsd - walletRepaidUsd;
  const cashInUsd = marginUsd + walletRepaidUsd;
  const unrealizedPnlPct =
    cashInUsd > 0 ? (unrealizedPnlUsd / cashInUsd) * 100 : null;
  const healthDebtUsd = effectiveHealthDebtUsd(
    borrowedUsd,
    marginUsd,
    position.leverage_bps,
  );
  const healthBps =
    healthDebtUsd > 0
      ? Math.round((markValueUsd / healthDebtUsd) * 10_000)
      : positionSizeUsd > 0
        ? 100_000
        : null;

  let healthLabel: PositionMarkToMarket["healthLabel"] = "unknown";
  if (healthBps != null) {
    if (healthBps >= liquidationBps + 500) healthLabel = "healthy";
    else if (healthBps >= liquidationBps) healthLabel = "margin_call";
    else healthLabel = "at_risk";
  }

  const markBidCents = premiumRawToCents(redeemQuote.marketBidPerUnit);

  return {
    positionKey: positionRowId(position),
    markValueUsd,
    markBidPerUnit: Number(redeemQuote.marketBidPerUnit),
    markBidCents,
    entryCostUsd,
    entryPremiumPerUnit: entryPremium != null ? Number(entryPremium) : null,
    entryPremiumCents,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    netEquityUsd,
    healthBps,
    healthLabel,
    isLive: true,
  };
}

export function formatPnlUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPnlPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function formatHealthBps(bps: number | null): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(1)}%`;
}
