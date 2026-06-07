import { baseFromUnderlying } from "@/lib/markets";
import type { MarketCatalogEntry } from "@/lib/leverx/indexer-client";
import {
  buildQuestion,
  catalogEntryToMarketRow,
  type LeverxMarketRow,
} from "@/lib/leverx/indexer-markets";
import { FLOAT_SCALING } from "@/lib/predict/constants";
import { isActiveOracleRow } from "@/lib/predict/oracles";
import type { PredictOracleSummary } from "@/lib/predict/types";

const SCALE = Number(FLOAT_SCALING);

export type MarketCategory = "All" | "Live" | "Range";

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

function enrichRow(
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
  catalogByOracle: Map<string, MarketCatalogEntry[]>,
): PredictOracleSummary[] {
  if (category === "Range") return [];

  const hasCatalog = (id: string) => (catalogByOracle.get(id)?.length ?? 0) > 0;

  if (category === "Live") {
    return oracles.filter((o) => isActiveOracleRow(o));
  }

  return oracles.filter(
    (o) => isActiveOracleRow(o) || hasCatalog(o.oracle_id),
  );
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

  let rows: LeverxMarketRow[];

  if (category === "Range") {
    rows = catalog
      .filter((e) => e.is_range)
      .map((e) => {
        const base = catalogEntryToMarketRow(e);
        return enrichRow(base, oracleById.get(e.oracle_id), spotByOracle?.get(e.oracle_id));
      });
  } else {
    const selectedOracles = oraclesForCategory(oracles, category, catalogByOracle);
    const seen = new Set<string>();

    rows = [];
    for (const oracle of selectedOracles) {
      const entries = (catalogByOracle.get(oracle.oracle_id) ?? []).filter((e) => !e.is_range);

      if (entries.length > 0) {
        for (const entry of entries) {
          const row = enrichRow(
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

      if (!isActiveOracleRow(oracle)) continue;

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

    if (category === "All") {
      for (const entry of catalog.filter((e) => e.is_range)) {
        const row = enrichRow(
          catalogEntryToMarketRow(entry),
          oracleById.get(entry.oracle_id),
          spotByOracle?.get(entry.oracle_id),
        );
        if (!seen.has(row.id)) {
          seen.add(row.id);
          rows.push(row);
        }
      }
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
  side?: "up" | "down" | "range";
}): LeverxMarketRow | undefined {
  const { oracleId, oracle, oracleSpot, catalogRows, strikeRaw, lowerStrikeRaw, side = "up" } =
    args;

  const fromCatalog = catalogRows.find((m) => {
    if (side === "range") {
      return m.isRange && (!lowerStrikeRaw || m.strikeRaw === lowerStrikeRaw);
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

  if (side === "range" && lowerStrikeRaw) {
    const higher = args.catalogRows.find((m) => m.isRange && m.strikeRaw === lowerStrikeRaw)
      ?.higherStrikeRaw;
    if (higher) {
      const asset = oracleAsset(oracle);
      const expiry = oracle.expiry ?? 0;
      return {
        id: `${oracleId}:${expiry}:${lowerStrikeRaw}:${higher}:1:1`,
        oracleId,
        asset,
        strike: lowerStrikeRaw / SCALE,
        strikeRaw: lowerStrikeRaw,
        higherStrikeRaw: higher,
        expiry,
        isUp: true,
        isRange: true,
        question: buildQuestion(asset, lowerStrikeRaw, expiry, true, higher, true),
        lastAskPremium: null,
        volume: 0,
        status: oracle.status ?? "active",
        spotPrice: spot > 0 ? spot : null,
        oracleStatus: oracle.status,
        underlyingAsset: oracle.underlying_asset,
      };
    }
    return undefined;
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
