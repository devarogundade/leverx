import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CHART_OHLCV_INTERVAL,
  CHART_OHLCV_LOOKBACK_MS,
  fetchDeepbookOhlcv,
  ohlcvCandlesToSparklineSeries,
} from "@/lib/deepbook/ohlcv";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";

const MARKETS_OHLCV_PAIR = "XBTC_USDC";
const OHLCV_REFETCH_MS = 60_000;

async function fetchMarketsOhlcvSparkline() {
  const endTime = Date.now();
  const startTime = endTime - CHART_OHLCV_LOOKBACK_MS;
  const candles = await fetchDeepbookOhlcv(
    MARKETS_OHLCV_PAIR,
    CHART_OHLCV_INTERVAL,
    startTime,
    endTime,
  );
  return ohlcvCandlesToSparklineSeries(candles);
}

/** Shared XBTC_USDC OHLCV close-price sparkline for market grid/list cards. */
export function useMarketPremiumSparklines(markets: readonly LeverxMarketRow[]) {
  const query = useQuery({
    queryKey: ["deepbook-ohlcv", MARKETS_OHLCV_PAIR, CHART_OHLCV_INTERVAL],
    queryFn: fetchMarketsOhlcvSparkline,
    staleTime: OHLCV_REFETCH_MS / 2,
    refetchInterval: OHLCV_REFETCH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const seriesByMarketId = useMemo(() => {
    const sparkline = query.data ?? [];
    const map = new Map<string, number[]>();
    for (const market of markets) {
      map.set(market.id, sparkline);
    }
    return map;
  }, [markets, query.data]);

  return {
    seriesByMarketId,
    isLoading: query.isLoading,
  };
}
