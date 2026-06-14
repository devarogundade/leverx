import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { appConfig } from "@/lib/config";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import { leverxMarketAskQueryKey } from "@/hooks/useLeverxMarketAsk";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { marketRowToKey } from "@/lib/leverx/market-keys";
import { fetchPredictMarketAsk } from "@/lib/leverx/quotes";

function quoteCfg(
  packageId: string | undefined,
  predictId?: string,
  predictPackageId?: string,
) {
  if (!packageId) return null;
  return {
    packageId,
    predictId: predictId ?? appConfig.predictId,
    predictPackageId: predictPackageId ?? appConfig.predictPackageId,
  };
}

export function withLiveMarketAsks(
  markets: readonly LeverxMarketRow[],
  askByMarketId?: ReadonlyMap<string, number>,
): LeverxMarketRow[] {
  return markets.map((m) => {
    const live = askByMarketId?.get(m.id);
    return { ...m, lastAskPremium: live ?? null };
  });
}

/** Live per-contract ask (devInspect) for markets on the current page — no catalog fallback. */
export function useVisibleMarketAsks(markets: readonly LeverxMarketRow[]) {
  const { client } = useWallet();
  const queryClient = useQueryClient();
  const { cfg: fullCfg } = useLeverxProtocolConfig();
  const cfg = useMemo(
    () =>
      fullCfg
        ? quoteCfg(fullCfg.packageId, fullCfg.predictId, fullCfg.predictPackageId)
        : null,
    [fullCfg],
  );

  const marketKeys = useMemo(() => {
    const entries: Array<{ marketId: string; key: NonNullable<ReturnType<typeof marketRowToKey>> }> =
      [];
    for (const m of markets) {
      const key = marketRowToKey(m);
      if (key) entries.push({ marketId: m.id, key });
    }
    return entries;
  }, [markets]);

  const batchKey = marketKeys
    .map((entry) => entry.marketId)
    .sort()
    .join(",");

  const query = useQuery({
    queryKey: ["leverx-visible-market-asks", batchKey],
    queryFn: async () => {
      if (!cfg) return new Map<string, number>();

      const entries = await Promise.all(
        marketKeys.map(async ({ marketId, key }) => {
          const ask = await queryClient.fetchQuery({
            queryKey: leverxMarketAskQueryKey(key),
            queryFn: () => fetchPredictMarketAsk({ client, cfg, key }),
            staleTime: 10_000,
          });
          if (ask == null || ask <= 0n) return null;
          return [marketId, Number(ask)] as const;
        }),
      );

      return new Map(
        entries.filter((entry): entry is readonly [string, number] => entry !== null),
      );
    },
    enabled: Boolean(cfg && marketKeys.length > 0),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  const enrichedMarkets = useMemo(
    () => withLiveMarketAsks(markets, query.data),
    [markets, query.data],
  );

  return {
    markets: enrichedMarkets,
    isLoading: marketKeys.length > 0 && query.isLoading && !query.data,
    isFetching: query.isFetching,
  };
}
