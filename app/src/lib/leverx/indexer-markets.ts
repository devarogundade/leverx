import { FLOAT_SCALING } from "@/lib/predict/constants";
import type { MarketCatalogEntry } from "@/lib/leverx/indexer-client";
import type { PredictSide } from "@/lib/predict/instruments";
import { scaleQuote } from "@/lib/predict/scaling";

export interface LeverxMarketRow {
  id: string;
  oracleId: string;
  asset: string;
  strike: number;
  strikeRaw: number;
  expiry: number;
  higherStrikeRaw: number;
  isUp: boolean;
  isRange: boolean;
  question: string;
  lastAskPremium: number | null;
  volume: number;
  status: string;
  /** Live spot from Predict server (USD). */
  spotPrice?: number | null;
  oracleStatus?: string;
  underlyingAsset?: string;
}

const SCALE = Number(FLOAT_SCALING);

/** ask_price / bid_price → display cents (0–100) */
export function premiumToCents(premium: number): number {
  if (premium <= 0) return 0;
  return (premium / SCALE) * 100;
}

export function formatPremiumCents(premium: number): string {
  return `${premiumToCents(premium).toFixed(1)}¢`;
}

export function formatPremiumOrPlaceholder(premium: number | null | undefined): string {
  if (premium == null || premium <= 0) return "_";
  return formatPremiumCents(premium);
}

/** Prefer live on-chain ask; fall back to indexer catalog premium. */
export function formatContractPremiumLabel(args: {
  liveAskRaw?: bigint | null;
  catalogPremium?: number | null;
  loading?: boolean;
}): string {
  if (args.liveAskRaw != null && args.liveAskRaw > 0n) {
    return formatPremiumCents(Number(args.liveAskRaw));
  }
  if (args.catalogPremium != null && args.catalogPremium > 0) {
    return formatPremiumOrPlaceholder(args.catalogPremium);
  }
  if (args.loading) return "…";
  return formatPremiumOrPlaceholder(null);
}

function formatStrikeUsd(strike: number): string {
  return `$${(strike / SCALE).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function oracleAssetLabel(oracleId: string): string {
  return oracleId.slice(2, 6).toUpperCase() || "MKT";
}

export function buildQuestion(
  asset: string,
  strike: number,
  expiry: number,
  isRange: boolean,
  higherStrike: number,
  isUp: boolean,
): string {
  const date = new Date(expiry).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (isRange) {
    return `Will ${asset} settle between ${formatStrikeUsd(strike)} and ${formatStrikeUsd(higherStrike)} on ${date}?`;
  }
  const direction = isUp ? "above" : "below";
  return `Will ${asset} be ${direction} ${formatStrikeUsd(strike)} on ${date}?`;
}

export function catalogEntryToMarketRow(entry: MarketCatalogEntry): LeverxMarketRow {
  const asset = oracleAssetLabel(entry.oracle_id);

  return {
    id: entry.market_key,
    oracleId: entry.oracle_id,
    asset,
    strike: entry.strike / SCALE,
    strikeRaw: entry.strike,
    higherStrikeRaw: entry.higher_strike,
    expiry: entry.expiry_ms,
    isUp: entry.is_up,
    isRange: entry.is_range,
    question: buildQuestion(
      asset,
      entry.strike,
      entry.expiry_ms,
      entry.is_range,
      entry.higher_strike,
      entry.is_up,
    ),
    lastAskPremium: entry.last_ask_price ?? null,
    volume: scaleQuote(entry.volume_24h),
    status: entry.trade_count_24h > 0 ? "active" : "indexed",
  };
}

export function catalogToMarketRows(entries: readonly MarketCatalogEntry[]): LeverxMarketRow[] {
  return entries.map(catalogEntryToMarketRow).sort((a, b) => b.volume - a.volume);
}

export function findMarketRow(
  rows: readonly LeverxMarketRow[],
  args: { strikeRaw?: number; side?: PredictSide },
): LeverxMarketRow | undefined {
  const { strikeRaw, side = "up" } = args;

  if (side === "range") {
    return rows.find((m) => m.isRange && (!strikeRaw || m.strikeRaw === strikeRaw));
  }

  const isUp = side === "up";
  if (strikeRaw) {
    return rows.find(
      (m) => !m.isRange && m.isUp === isUp && m.strikeRaw === strikeRaw,
    );
  }

  return rows.find((m) => !m.isRange && m.isUp === isUp) ?? rows[0];
}

export function rangeBoundsForRow(m: LeverxMarketRow): { lower: number; upper: number } | null {
  if (!m.isRange || m.higherStrikeRaw <= 0) return null;
  return { lower: m.strikeRaw, upper: m.higherStrikeRaw };
}
