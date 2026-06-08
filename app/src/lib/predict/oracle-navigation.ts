import { sortOracleRows } from "@/lib/predict/other-oracles";
import type { PredictOracleSummary } from "@/lib/predict/types";

export interface OracleNeighbors {
  index: number;
  prev: PredictOracleSummary | null;
  next: PredictOracleSummary | null;
}

/** Prev/next oracle in predict-server list order (same as markets table). */
export function resolveOracleNeighbors(
  oracles: readonly PredictOracleSummary[],
  oracleId: string,
): OracleNeighbors {
  const sorted = sortOracleRows(oracles);
  const index = sorted.findIndex((row) => row.oracle_id === oracleId);
  if (index < 0) {
    return { index: -1, prev: null, next: null };
  }
  return {
    index,
    prev: index > 0 ? sorted[index - 1]! : null,
    next: index < sorted.length - 1 ? sorted[index + 1]! : null,
  };
}
