import { appConfig } from "@/lib/config";
import { fetchJson } from "@/lib/api/fetch-json";
import { parsePredictOraclesList } from "@/lib/predict/oracles";
import type { PredictOracleSummary } from "@/lib/predict/types";

export const PREDICT_ORACLES_QUERY_KEY = ["predict-oracles", appConfig.predictId] as const;

const CACHE_TTL_MS = 300_000;

let cachedRows: PredictOracleSummary[] | null = null;
let cachedAt = 0;
let inflight: Promise<PredictOracleSummary[]> | null = null;

async function loadOracleRows(): Promise<PredictOracleSummary[]> {
  const base = appConfig.predictServerUrl.replace(/\/$/, "");
  const data = await fetchJson<unknown>(`${base}/predicts/${appConfig.predictId}/oracles`, {
    timeoutMs: 120_000,
  });
  return parsePredictOraclesList(data);
}

/** Shared oracle list (large payload) — deduped in-flight + short TTL cache. */
export async function getPredictOracleRows(): Promise<PredictOracleSummary[]> {
  const now = Date.now();
  if (cachedRows && now - cachedAt < CACHE_TTL_MS) {
    return cachedRows;
  }

  if (!inflight) {
    inflight = loadOracleRows()
      .then((rows) => {
        cachedRows = rows;
        cachedAt = Date.now();
        return rows;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function invalidatePredictOracleCache(): void {
  cachedRows = null;
  cachedAt = 0;
}
