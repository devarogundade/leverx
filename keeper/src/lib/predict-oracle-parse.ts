import { FLOAT_SCALING } from '../telegram/telegram-trade-math';
import type { PredictOracleRow, PredictOracleState } from '../telegram/telegram-session.types';

function scaledFromApi(value: unknown): number | undefined {
  if (typeof value !== 'number' || value <= 0) return undefined;
  return value / Number(FLOAT_SCALING);
}

/** Predict-server returns a bare array; older docs used `{ oracles: [] }`. */
export function parsePredictOraclesList(data: unknown): PredictOracleRow[] {
  if (Array.isArray(data)) return data as PredictOracleRow[];
  if (data && typeof data === 'object') {
    const oracles = (data as { oracles?: unknown }).oracles;
    if (Array.isArray(oracles)) return oracles as PredictOracleRow[];
  }
  return [];
}

/** True when the predict-server oracle list row is settled or expired. */
export function isPredictOracleRowSettled(row: PredictOracleRow, nowMs = Date.now()): boolean {
  if (row.is_settled === true) return true;
  if (row.settled_at != null && row.settled_at > 0) return true;
  if (String(row.status ?? '').toLowerCase() === 'settled') return true;
  const expiry = row.expiry ?? 0;
  return expiry > 0 && expiry <= nowMs;
}

/**
 * `GET /oracles/:id/state` wraps fields under `oracle` + `latest_price.spot`.
 * Flat legacy payloads are still accepted.
 */
export function parseOracleState(data: unknown): PredictOracleState | null {
  if (!data || typeof data !== 'object') return null;

  const raw = data as Record<string, unknown>;
  const nested = raw.oracle;
  if (nested && typeof nested === 'object') {
    const oracle = nested as Record<string, unknown>;
    const latest = raw.latest_price;
    let spot_price: number | undefined;
    if (latest && typeof latest === 'object') {
      const spot = (latest as Record<string, unknown>).spot;
      if (typeof spot === 'number' && spot > 0) {
        spot_price = spot;
      }
    }

    const settlement_price = scaledFromApi(oracle.settlement_price);
    const status = oracle.status as string | undefined;
    const settled_at = oracle.settled_at as number | null | undefined;

    return {
      spot_price: spot_price ?? settlement_price,
      status,
      is_settled:
        settled_at != null && settled_at > 0
          ? true
          : String(status ?? '').toLowerCase() === 'settled',
      min_strike: typeof oracle.min_strike === 'number' ? oracle.min_strike : undefined,
      tick_size: typeof oracle.tick_size === 'number' ? oracle.tick_size : undefined,
      expiry: typeof oracle.expiry === 'number' ? oracle.expiry : undefined,
    };
  }

  const flat = data as PredictOracleState;
  if (flat.spot_price == null && flat.min_strike == null && flat.expiry == null && flat.status == null) {
    return null;
  }

  return {
    spot_price: flat.spot_price,
    status: flat.status,
    is_settled:
      flat.is_settled === true || String(flat.status ?? '').toLowerCase() === 'settled',
    min_strike: flat.min_strike,
    tick_size: flat.tick_size,
    expiry: flat.expiry,
  };
}
