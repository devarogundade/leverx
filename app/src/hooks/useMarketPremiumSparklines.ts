import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { appConfig } from "@/lib/config";
import { fetchGlobalMarketTrades, type GlobalMarketTrade } from "@/lib/leverx/indexer-client";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import { buildPremiumSparklineMap } from "@/lib/leverx/premium-sparkline";

const enabled = Boolean(appConfig.leverxIndexerUrl);

async function fetchTradesByOracle(
  oracleIds: readonly string[],
): Promise<Map<string, GlobalMarketTrade[]>> {
  const entries = await Promise.all(
    oracleIds.map(async (oracleId) => {
      const { items } = await fetchGlobalMarketTrades(oracleId, { limit: 150 });
      return [oracleId, items] as const;
    }),
  );
  return new Map(entries);
}

export function useMarketPremiumSparklines(markets: readonly LeverxMarketRow[]) {
  const oracleIds = useMemo(
    () => [...new Set(markets.map((market) => market.oracleId).filter(Boolean))].sort(),
    [markets],
  );

  const query = useQuery({
    queryKey: ["market-premium-sparklines", oracleIds.join(",")],
    queryFn: () => fetchTradesByOracle(oracleIds),
    enabled: enabled && oracleIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });

  const seriesByMarketId = useMemo(() => {
    if (!query.data) return new Map<string, number[]>();
    return buildPremiumSparklineMap(markets, query.data);
  }, [markets, query.data]);

  return {
    seriesByMarketId,
    isLoading: query.isLoading,
  };
}
