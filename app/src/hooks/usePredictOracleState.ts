import { useQuery } from "@tanstack/react-query";
import { fetchOracleState } from "@/lib/predict/client";

export function usePredictOracleState(oracleId: string) {
  return useQuery({
    queryKey: ["predict-oracle-state", oracleId],
    queryFn: () => fetchOracleState(oracleId),
    enabled: Boolean(oracleId),
    staleTime: 60_000,
    retry: 1,
  });
}
