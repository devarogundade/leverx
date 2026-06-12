import type { RedeemQuote } from "@/lib/leverx/quotes";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { MARGIN_CALL_BPS } from "@/lib/leverx/protocol";
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

export function entryPremiumPerUnitRaw(position: LeveragedPosition): bigint | null {
  if (position.open_quantity <= 0 || position.mint_cost <= 0) return null;
  return (
    (BigInt(position.mint_cost) * PREDICT_PRICE_SCALE) /
    BigInt(position.open_quantity)
  );
}

export function computePositionMarkToMarket(
  position: LeveragedPosition,
  redeemQuote: RedeemQuote | null | undefined,
  quoteLoading: boolean,
): PositionMarkToMarket {
  const entryCostUsd = scaleQuote(position.mint_cost);
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
      netEquityUsd: marginUsd - borrowedUsd,
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
  // Match on-chain ltv::evaluate_account_health: collateral vs debt (mark value / borrow).
  const healthBps =
    borrowedUsd > 0
      ? Math.round((markValueUsd / borrowedUsd) * 10_000)
      : positionSizeUsd > 0
        ? 100_000
        : null;

  let healthLabel: PositionMarkToMarket["healthLabel"] = "unknown";
  if (healthBps != null) {
    if (healthBps >= MARGIN_CALL_BPS) healthLabel = "healthy";
    else if (healthBps >= 8_000) healthLabel = "margin_call";
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
