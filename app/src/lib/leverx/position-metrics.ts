import type { RedeemQuote } from "@/lib/leverx/quotes";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { DEFAULT_LIQUIDATION_BPS } from "@/lib/leverx/protocol";
import { PREDICT_PRICE_SCALE } from "@/lib/leverx/constants";
import { premiumRawToCents } from "@/lib/leverx/trade-math";
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

/** Realized P&L for closed/settled/liquidated rows (payout minus cost basis). */
export function realizedPnlUsd(position: LeveragedPosition): number | null {
  if (!isEndedPosition(position)) return null;
  const payoutUsd = scaleQuote(position.realized_payout);
  const costUsd = scaleQuote(effectiveMintCostAtoms(position));
  return payoutUsd - costUsd;
}

export function realizedPnlPct(position: LeveragedPosition): number | null {
  const pnlUsd = realizedPnlUsd(position);
  const costUsd = scaleQuote(effectiveMintCostAtoms(position));
  if (pnlUsd == null || costUsd <= 0) return null;
  return (pnlUsd / costUsd) * 100;
}

export function closedEntryPremiumCents(position: LeveragedPosition): number | null {
  const premium = entryPremiumPerUnitRaw(position);
  return premium != null ? premiumRawToCents(premium) : null;
}

/** Cap ghost mint_cost until indexer migration repairs historical rows. */
export function effectiveMintCostAtoms(position: LeveragedPosition): number {
  if (position.mint_cost <= 0) return 0;
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

/** Matches on-chain `predict_client::premium_per_unit` (divide-and-round-up). */
export function entryPremiumPerUnitRaw(position: LeveragedPosition): bigint | null {
  const mintCost = effectiveMintCostAtoms(position);
  if (position.open_quantity <= 0 || mintCost <= 0) return null;
  const numerator = BigInt(mintCost) * PREDICT_PRICE_SCALE;
  const quantity = BigInt(position.open_quantity);
  return (numerator + quantity - 1n) / quantity;
}

export function computePositionMarkToMarket(
  position: LeveragedPosition,
  redeemQuote: RedeemQuote | null | undefined,
  quoteLoading: boolean,
  liquidationBps: number = DEFAULT_LIQUIDATION_BPS,
): PositionMarkToMarket {
  const entryCostUsd = scaleQuote(effectiveMintCostAtoms(position));
  const marginUsd = scaleQuote(position.margin_quote);
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const positionSizeUsd = marginUsd + borrowedUsd;

  const entryPremium = entryPremiumPerUnitRaw(position);
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
  const unrealizedPnlUsd = markValueUsd - entryCostUsd;
  const unrealizedPnlPct =
    entryCostUsd > 0 ? (unrealizedPnlUsd / entryCostUsd) * 100 : null;

  const netEquityUsd = markValueUsd - borrowedUsd;
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
