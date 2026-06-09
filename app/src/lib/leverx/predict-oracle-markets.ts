import { baseFromUnderlying } from "@/lib/markets";
import type { MarketCatalogEntry } from "@/lib/leverx/indexer-client";
import {
  buildQuestion,
  catalogEntryToMarketRow,
  type LeverxMarketRow,
} from "@/lib/leverx/indexer-markets";
import { FLOAT_SCALING } from "@/lib/predict/constants";
import { isActiveOracleRow, isLiveOracleRow, isSettledOracleRow } from "@/lib/predict/oracles";
import type { PredictOracleSummary } from "@/lib/predict/types";

const SCALE = Number(FLOAT_SCALING);

export type MarketCategory = "All" | "Live" | "Closed";

function scaledRaw(value: number | undefined | null): number {
  if (value == null || value <= 0) return 0;
  return value;
}

/** Round spot to tick for default ATM strike (raw 1e9 units). */
export function atmStrikeRaw(
  spotUsd: number,
  minStrikeRaw: number,
  tickSizeRaw: number,
): number {
  if (spotUsd <= 0) return minStrikeRaw > 0 ? minStrikeRaw : 0;
  const spotRaw = Math.round(spotUsd * SCALE);
  const tick = tickSizeRaw > 0 ? tickSizeRaw : minStrikeRaw;
  if (tick <= 0) return spotRaw;
  return Math.max(minStrikeRaw, Math.round(spotRaw / tick) * tick);
}

function oracleAsset(oracle: PredictOracleSummary): string {
  return baseFromUnderlying(oracle.underlying_asset ?? "") || "MKT";
}

function toStrikeRaw(value: number | undefined | null): number {
  if (value == null || value <= 0) return 0;
  // List rows may be 1e9-scaled; detail rows are USD after scaledFromApi.
  return value < 1_000_000 ? Math.round(value * SCALE) : Math.round(value);
}

/** Resolve vertical range bounds for an oracle (catalog row, URL params, or ATM ± tick). */
export function resolveRangeBounds(args: {
  oracleId: string;
  catalogRows?: readonly LeverxMarketRow[];
  oracle?: PredictOracleSummary | null;
  oracleSpot?: number | null;
  strikeRaw?: number;
  lowerStrikeRaw?: number;
  upperStrikeRaw?: number;
}): { lower: number; upper: number } | null {
  const catalogRows = args.catalogRows ?? [];

  if (
    args.lowerStrikeRaw &&
    args.upperStrikeRaw &&
    args.upperStrikeRaw > args.lowerStrikeRaw
  ) {
    return { lower: args.lowerStrikeRaw, upper: args.upperStrikeRaw };
  }

  if (args.lowerStrikeRaw) {
    const matched = catalogRows.find(
      (m) =>
        m.oracleId === args.oracleId &&
        m.isRange &&
        m.strikeRaw === args.lowerStrikeRaw &&
        m.higherStrikeRaw > m.strikeRaw,
    );
    if (matched) {
      return { lower: matched.strikeRaw, upper: matched.higherStrikeRaw };
    }
  }

  const catalogRange = catalogRows.find(
    (m) => m.oracleId === args.oracleId && m.isRange && m.higherStrikeRaw > m.strikeRaw,
  );
  if (catalogRange) {
    return { lower: catalogRange.strikeRaw, upper: catalogRange.higherStrikeRaw };
  }

  const minStrikeRaw = toStrikeRaw(args.oracle?.min_strike);
  const tickRaw =
    toStrikeRaw(args.oracle?.tick_size) || minStrikeRaw || SCALE;
  const spot =
    args.oracleSpot ??
    (args.oracle?.settlement_price
      ? args.oracle.settlement_price < 1_000_000
        ? args.oracle.settlement_price
        : args.oracle.settlement_price / SCALE
      : 0);

  const atm =
    args.strikeRaw && args.strikeRaw > 0
      ? args.strikeRaw
      : atmStrikeRaw(spot ?? 0, minStrikeRaw, tickRaw);

  if (atm <= 0) return null;

  const lower = Math.max(minStrikeRaw > 0 ? minStrikeRaw : tickRaw, atm - tickRaw);
  const upper = atm + tickRaw;
  if (upper <= lower) return null;

  return { lower, upper };
}

function buildSyntheticRangeRow(
  oracle: PredictOracleSummary,
  oracleId: string,
  lower: number,
  upper: number,
  spot?: number,
): LeverxMarketRow {
  const asset = oracleAsset(oracle);
  const expiry = oracle.expiry ?? 0;
  return {
    id: `${oracleId}:${expiry}:${lower}:${upper}:1:1`,
    oracleId,
    asset,
    strike: lower / SCALE,
    strikeRaw: lower,
    higherStrikeRaw: upper,
    expiry,
    isUp: true,
    isRange: true,
    question: buildQuestion(asset, lower, expiry, true, upper, true),
    lastAskPremium: null,
    volume: 0,
    status: oracle.status ?? "active",
    spotPrice: spot != null && spot > 0 ? spot : null,
    oracleStatus: oracle.status,
    underlyingAsset: oracle.underlying_asset,
  };
}

function groupCatalogByOracle(
  catalog: readonly MarketCatalogEntry[],
): Map<string, MarketCatalogEntry[]> {
  const map = new Map<string, MarketCatalogEntry[]>();
  for (const entry of catalog) {
    const list = map.get(entry.oracle_id) ?? [];
    list.push(entry);
    map.set(entry.oracle_id, list);
  }
  return map;
}

export function enrichMarketRow(
  row: LeverxMarketRow,
  oracle: PredictOracleSummary | undefined,
  spot?: number,
): LeverxMarketRow {
  if (!oracle) return row;
  const asset = oracleAsset(oracle);
  const expiry = row.expiry > 0 ? row.expiry : (oracle.expiry ?? 0);
  return {
    ...row,
    asset,
    expiry,
    oracleStatus: oracle.status,
    underlyingAsset: oracle.underlying_asset,
    spotPrice: spot ?? row.spotPrice ?? null,
    question: buildQuestion(
      asset,
      row.strikeRaw,
      expiry,
      row.isRange,
      row.higherStrikeRaw,
      row.isUp,
    ),
    status: row.status === "indexed" && oracle.status ? oracle.status : row.status,
  };
}

function defaultUpRow(
  oracle: PredictOracleSummary,
  strikeRaw: number,
  spot?: number,
): LeverxMarketRow {
  const asset = oracleAsset(oracle);
  const expiry = oracle.expiry ?? 0;
  const marketKey = `${oracle.oracle_id}:${expiry}:${strikeRaw}:0:1:0`;

  return {
    id: marketKey,
    oracleId: oracle.oracle_id,
    asset,
    strike: strikeRaw / SCALE,
    strikeRaw,
    higherStrikeRaw: 0,
    expiry,
    isUp: true,
    isRange: false,
    question: buildQuestion(asset, strikeRaw, expiry, false, 0, true),
    lastAskPremium: null,
    volume: 0,
    status: oracle.status ?? "active",
    spotPrice: spot ?? null,
    oracleStatus: oracle.status,
    underlyingAsset: oracle.underlying_asset,
  };
}

function oraclesForCategory(
  oracles: readonly PredictOracleSummary[],
  category: MarketCategory,
): PredictOracleSummary[] {
  if (category === "Live") {
    return oracles.filter((o) => isLiveOracleRow(o));
  }

  if (category === "Closed") {
    return oracles.filter((o) => isSettledOracleRow(o));
  }

  return oracles.filter((o) => Boolean(o.oracle_id));
}

function catalogEntriesForCategory(
  entries: readonly MarketCatalogEntry[],
  category: MarketCategory,
): MarketCatalogEntry[] {
  if (category === "Live") {
    return entries.filter((entry) => !entry.is_range);
  }
  return [...entries];
}

export function mergeOracleMarkets(args: {
  oracles: readonly PredictOracleSummary[];
  catalog: readonly MarketCatalogEntry[];
  spotByOracle?: ReadonlyMap<string, number>;
  category: MarketCategory;
  search?: string;
}): LeverxMarketRow[] {
  const { oracles, catalog, spotByOracle, category, search = "" } = args;
  const oracleById = new Map(oracles.map((o) => [o.oracle_id, o]));
  const catalogByOracle = groupCatalogByOracle(catalog);

  const selectedOracles = oraclesForCategory(oracles, category);
  const seen = new Set<string>();
  const rows: LeverxMarketRow[] = [];

  for (const oracle of selectedOracles) {
    const entries = catalogEntriesForCategory(
      catalogByOracle.get(oracle.oracle_id) ?? [],
      category,
    );

    if (entries.length > 0) {
      for (const entry of entries) {
        const row = enrichMarketRow(
          catalogEntryToMarketRow(entry),
          oracle,
          spotByOracle?.get(oracle.oracle_id),
        );
        if (!seen.has(row.id)) {
          seen.add(row.id);
          rows.push(row);
        }
      }
      continue;
    }

    if (isSettledOracleRow(oracle)) continue;

    const spot =
      spotByOracle?.get(oracle.oracle_id) ??
      (oracle.settlement_price ? oracle.settlement_price / SCALE : undefined);
    const strikeRaw = atmStrikeRaw(
      spot ?? 0,
      scaledRaw(oracle.min_strike),
      scaledRaw(oracle.tick_size),
    );
    if (strikeRaw <= 0) continue;

    const row = defaultUpRow(oracle, strikeRaw, spot);
    if (!seen.has(row.id)) {
      seen.add(row.id);
      rows.push(row);
    }
  }

  rows.sort((a, b) => b.volume - a.volume || b.expiry - a.expiry);

  const q = search.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter(
    (m) =>
      m.question.toLowerCase().includes(q) ||
      m.asset.toLowerCase().includes(q) ||
      m.oracleId.toLowerCase().includes(q) ||
      (m.underlyingAsset?.toLowerCase().includes(q) ?? false),
  );
}

export function resolveTradeMarket(args: {
  oracleId: string;
  oracle?: PredictOracleSummary | null;
  oracleSpot?: number | null;
  catalogRows: readonly LeverxMarketRow[];
  strikeRaw?: number;
  lowerStrikeRaw?: number;
  upperStrikeRaw?: number;
  side?: "up" | "down" | "range";
}): LeverxMarketRow | undefined {
  const {
    oracleId,
    oracle,
    oracleSpot,
    catalogRows,
    strikeRaw,
    lowerStrikeRaw,
    upperStrikeRaw,
    side = "up",
  } = args;

  const fromCatalog = catalogRows.find((m) => {
    if (side === "range") {
      const bounds = resolveRangeBounds({
        oracleId,
        catalogRows,
        oracle,
        oracleSpot,
        strikeRaw,
        lowerStrikeRaw,
        upperStrikeRaw,
      });
      if (!bounds) return m.isRange && (!lowerStrikeRaw || m.strikeRaw === lowerStrikeRaw);
      return (
        m.isRange &&
        m.strikeRaw === bounds.lower &&
        m.higherStrikeRaw === bounds.upper
      );
    }
    if (strikeRaw) {
      return !m.isRange && m.isUp === (side === "up") && m.strikeRaw === strikeRaw;
    }
    return !m.isRange && m.isUp === (side === "up");
  });

  if (fromCatalog) return fromCatalog;

  if (!oracle || !isActiveOracleRow(oracle)) return undefined;

  const spot = oracleSpot ?? (oracle.settlement_price ? oracle.settlement_price / SCALE : 0);
  const rawStrike =
    side === "range" && lowerStrikeRaw
      ? lowerStrikeRaw
      : strikeRaw ??
        atmStrikeRaw(spot, scaledRaw(oracle.min_strike), scaledRaw(oracle.tick_size));

  if (rawStrike <= 0) return undefined;

  if (side === "range") {
    const bounds = resolveRangeBounds({
      oracleId,
      catalogRows,
      oracle,
      oracleSpot,
      strikeRaw,
      lowerStrikeRaw,
      upperStrikeRaw,
    });
    if (!bounds || !oracle) return undefined;
    return buildSyntheticRangeRow(
      oracle,
      oracleId,
      bounds.lower,
      bounds.upper,
      spot > 0 ? spot : undefined,
    );
  }

  const row = defaultUpRow(oracle, rawStrike, spot > 0 ? spot : undefined);
  if (side === "down") {
    const asset = oracleAsset(oracle);
    const expiry = oracle.expiry ?? 0;
    return {
      ...row,
      id: `${oracleId}:${expiry}:${rawStrike}:0:0:0`,
      isUp: false,
      question: buildQuestion(asset, rawStrike, expiry, false, 0, false),
    };
  }
  return row;
}
