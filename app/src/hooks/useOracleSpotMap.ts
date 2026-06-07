import { useQuery } from "@tanstack/react-query";
import { fetchOracleSpotMap } from "@/lib/predict/client";

export function useOracleSpotMap(oracleIds: readonly string[]) {
  const key = oracleIds.length > 0 ? [...oracleIds].sort().join(",") : "";

  return useQuery({
    queryKey: ["predict-oracle-spots", key],
    queryFn: () => fetchOracleSpotMap(oracleIds),
    enabled: oracleIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
}
