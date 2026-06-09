import { FLOAT_SCALING } from "@/lib/predict/constants";
import { baseFromUnderlying } from "@/lib/markets";
import type { PredictOracleDetail, PredictOracleSummary } from "@/lib/predict/types";

function scaledFromApi(value: unknown): number | undefined {
  if (typeof value !== "number" || value <= 0) return undefined;
  return value / Number(FLOAT_SCALING);
}

/** Predict-server returns a bare array; older docs used `{ oracles: [] }`. */
export function parsePredictOraclesList(data: unknown): PredictOracleSummary[] {
  if (Array.isArray(data)) return data as PredictOracleSummary[];
  if (data && typeof data === "object") {
    const oracles = (data as { oracles?: unknown }).oracles;
    if (Array.isArray(oracles)) return oracles as PredictOracleSummary[];
  }
  return [];
}

/** State endpoint wraps fields under `oracle` + `latest_price.spot`. */
export function parseOracleState(data: unknown): PredictOracleDetail {
  if (!data || typeof data !== "object") {
    return { oracle_id: "" };
  }

  const raw = data as Record<string, unknown>;
  const nested = raw.oracle;
  if (nested && typeof nested === "object") {
    const oracle = nested as Record<string, unknown>;
    const latest = raw.latest_price;
    let spot_price: number | undefined;
    let latest_price_at: number | undefined;
    if (latest && typeof latest === "object") {
      const latestRow = latest as Record<string, unknown>;
      const spot = latestRow.spot;
      if (typeof spot === "number" && spot > 0) {
        spot_price = spot / Number(FLOAT_SCALING);
      }
      if (typeof latestRow.timestamp === "number") {
        latest_price_at = latestRow.timestamp;
      }
    }

    const settlement_price = scaledFromApi(oracle.settlement_price);

    return {
      oracle_id: String(oracle.oracle_id ?? ""),
      predict_id: oracle.predict_id as string | undefined,
      oracle_cap_id: oracle.oracle_cap_id as string | undefined,
      underlying_asset: oracle.underlying_asset as string | undefined,
      expiry: oracle.expiry as number | undefined,
      status: oracle.status as string | undefined,
      spot_price: spot_price ?? settlement_price,
      min_strike: scaledFromApi(oracle.min_strike),
      tick_size: scaledFromApi(oracle.tick_size),
      activated_at: oracle.activated_at as number | null | undefined,
      settlement_price,
      settled_at: oracle.settled_at as number | null | undefined,
      created_checkpoint: oracle.created_checkpoint as number | undefined,
      latest_price_at,
    };
  }

  return data as PredictOracleDetail;
}

const BASE_ALIASES: Record<string, string[]> = {
  BTC: ["BTC", "DBTC", "BITCOIN"],
  ETH: ["ETH", "WETH"],
  SUI: ["SUI"],
  SOL: ["SOL"],
  DEEP: ["DEEP"],
  WAL: ["WAL"],
};

export function matchesProtectionBase(underlying: string, base: string): boolean {
  const u = underlying.toUpperCase();
  const aliases = BASE_ALIASES[base.toUpperCase()] ?? [base.toUpperCase()];
  return aliases.some((a) => u === a || u.includes(a));
}

export function isOracleActiveStatus(status: string | undefined): boolean {
  return status?.toLowerCase() === "active";
}

/** Predict list row is active, non-expired, and has an oracle id. */
export function isActiveOracleRow(row: PredictOracleSummary, now = Date.now()): boolean {
  if (!row.oracle_id) return false;
  if (!isOracleActiveStatus(row.status)) return false;
  const expiryMs = row.expiry ?? 0;
  return expiryMs > now;
}

/** Settled, expired, or otherwise non-tradeable oracle row. */
export function isClosedOracleRow(row: PredictOracleSummary, now = Date.now()): boolean {
  return Boolean(row.oracle_id) && !isActiveOracleRow(row, now);
}

/** Active Predict oracle that settles protection for a margin base asset. */
export function isProtectionOracleForBase(
  row: PredictOracleSummary,
  base: string,
  now = Date.now(),
): boolean {
  if (!isActiveOracleRow(row, now)) return false;
  const underlying = row.underlying_asset ?? "";
  if (!underlying || !matchesProtectionBase(underlying, base)) return false;
  return true;
}

function pickNearestOracleForBase(
  rows: readonly PredictOracleSummary[],
  base: string,
  now = Date.now(),
): PredictOracleSummary | null {
  let best: PredictOracleSummary | null = null;
  let bestExpiry = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    if (!isProtectionOracleForBase(row, base, now)) continue;

    const expiryMs = row.expiry ?? 0;
    if (expiryMs < bestExpiry) {
      bestExpiry = expiryMs;
      best = row;
    }
  }

  return best;
}

/** Nearest non-expired active oracle for a margin base (no per-row state fetch). */
export function pickNearestActiveOracle(
  rows: readonly PredictOracleSummary[],
  base: string,
  now = Date.now(),
): PredictOracleSummary | null {
  return pickNearestOracleForBase(rows, base, now);
}

/** One nearest active oracle per normalized base asset. */
export function groupNearestActiveOraclesByBase(
  rows: readonly PredictOracleSummary[],
  now = Date.now(),
): Map<string, PredictOracleSummary> {
  const byBase = new Map<string, PredictOracleSummary>();

  for (const row of rows) {
    if (!isActiveOracleRow(row, now)) continue;

    const base = baseFromUnderlying(row.underlying_asset ?? "");
    if (!base) continue;

    const expiryMs = row.expiry ?? 0;
    const prev = byBase.get(base);
    if (!prev || expiryMs < (prev.expiry ?? Number.POSITIVE_INFINITY)) {
      byBase.set(base, row);
    }
  }

  return byBase;
}
