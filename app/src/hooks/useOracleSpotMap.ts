import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOraclePriceLatest } from "@/lib/predict/client";
import { oraclePriceLatestQueryKey } from "@/hooks/useOracleSpotPriceSeries";

export function useOracleSpotMap(oracleIds: readonly string[]) {
  const queryClient = useQueryClient();
  const key = oracleIds.length > 0 ? [...oracleIds].sort().join(",") : "";

  return useQuery({
    queryKey: ["predict-oracle-spots", key],
    queryFn: async () => {
      const entries = await Promise.all(
        oracleIds.map(async (id) => {
          const latest = await queryClient.fetchQuery({
            queryKey: oraclePriceLatestQueryKey(id),
            queryFn: () => fetchOraclePriceLatest(id),
            staleTime: 30_000,
          });
          return latest ? ([id, latest.spot] as const) : null;
        }),
      );

      return new Map(
        entries.filter((entry): entry is readonly [string, number] => entry !== null),
      );
    },
    enabled: oracleIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
}
