import { usePredictOracleContext } from "@/context/PredictOracleContext";

/** Predict-server oracle catalog — loaded once via PredictOracleProvider. */
export function usePredictOracleRows() {
  const ctx = usePredictOracleContext();
  return {
    data: ctx.oracles,
    isLoading: ctx.isLoading,
    isError: ctx.isError,
    isFetched: ctx.isFetched,
    error: ctx.error,
    refetch: ctx.refetch,
  };
}

export function useOracleNeighbors(oracleId: string) {
  const ctx = usePredictOracleContext();
  return ctx.getNeighbors(oracleId);
}
