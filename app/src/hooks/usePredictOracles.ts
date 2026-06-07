import { useQuery } from "@tanstack/react-query";
import { getPredictOracleRows, PREDICT_ORACLES_QUERY_KEY } from "@/lib/predict/oracle-cache";

/** Predict-server oracle catalog — primary market list source. */
export function usePredictOracleRows() {
  return useQuery({
    queryKey: PREDICT_ORACLES_QUERY_KEY,
    queryFn: getPredictOracleRows,
    staleTime: 300_000,
    retry: 2,
  });
}
