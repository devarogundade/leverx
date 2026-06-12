import { fetchJson } from "@/lib/api/fetch-json";
import { appConfig } from "@/lib/config";
import { normalizeProtectionBase } from "@/lib/markets";
import type { PricePoint } from "@/lib/predict/price-point";

/** `[timestamp_ms, open, high, low, close, volume]` — newest first from indexer. */
export type OhlcvCandle = [number, number, number, number, number, number];

export type OhlcvInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const CHART_OHLCV_INTERVAL: OhlcvInterval = "15m";
export const CHART_OHLCV_INTERVAL_MS = 15 * 60 * 1000;
export const CHART_OHLCV_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const DEEPBOOK_PAIRS: Record<string, string> = {
  BTC: "XBTC_USDC",
};

export function deepbookPairForAsset(asset: string): string | null {
  const base = normalizeProtectionBase(asset);
  if (!base) return null;
  return DEEPBOOK_PAIRS[base] ?? null;
}

export function ohlcvCandlesToPricePoints(candles: readonly OhlcvCandle[]): PricePoint[] {
  return candles
    .map(([t, , , , close]) => ({ t, price: close }))
    .filter((p) => p.t > 0 && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.t - b.t);
}

/** Align chart terminal with oracle “Current price” by overwriting the newest candle close. */
export function patchLatestPriceWithOracle(
  points: readonly PricePoint[],
  oracleSpot: number,
): PricePoint[] {
  if (points.length === 0 || !Number.isFinite(oracleSpot) || oracleSpot <= 0) {
    return [...points];
  }
  const next = [...points];
  next[next.length - 1] = { ...next[next.length - 1]!, price: oracleSpot };
  return next;
}

export async function fetchDeepbookOhlcv(
  pair: string,
  interval: OhlcvInterval,
  startTimeMs: number,
  endTimeMs: number,
): Promise<OhlcvCandle[]> {
  const base = appConfig.deepbookIndexerUrl.replace(/\/$/, "");
  const url =
    `${base}/ohclv/${encodeURIComponent(pair)}` +
    `?interval=${interval}` +
    `&start_time=${Math.floor(startTimeMs)}` +
    `&end_time=${Math.floor(endTimeMs)}`;

  const data = await fetchJson<{ candles?: OhlcvCandle[] }>(url, { timeoutMs: 20_000 });
  return Array.isArray(data.candles) ? data.candles : [];
}
