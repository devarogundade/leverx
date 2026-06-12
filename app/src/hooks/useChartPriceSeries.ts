import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CHART_OHLCV_INTERVAL,
  CHART_OHLCV_INTERVAL_MS,
  CHART_OHLCV_LOOKBACK_MS,
  deepbookPairForAsset,
  fetchDeepbookOhlcv,
  ohlcvCandlesToPricePoints,
  patchLatestPriceWithOracle,
} from "@/lib/deepbook/ohlcv";
import type { PricePoint } from "@/lib/predict/price-point";
import { useOraclePriceLatest, useOracleSpotPriceSeries } from "@/hooks/useOracleSpotPriceSeries";

const OHLCV_REFETCH_MS = 60_000;

export { CHART_OHLCV_INTERVAL_MS };

function useDeepbookChartSeries(
  pair: string,
  oracleId: string,
  enabled: boolean,
): {
  data: PricePoint[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { data: latest } = useOraclePriceLatest(oracleId, { enabled });

  const {
    data: candles,
    isLoading,
    isError,
    isFetched,
    refetch,
  } = useQuery({
    queryKey: ["deepbook-ohlcv", pair, CHART_OHLCV_INTERVAL],
    queryFn: async () => {
      const endTime = Date.now();
      const startTime = endTime - CHART_OHLCV_LOOKBACK_MS;
      return fetchDeepbookOhlcv(pair, CHART_OHLCV_INTERVAL, startTime, endTime);
    },
    enabled,
    staleTime: OHLCV_REFETCH_MS / 2,
    refetchInterval: enabled ? OHLCV_REFETCH_MS : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const data = useMemo(() => {
    if (!candles?.length) return [];
    const points = ohlcvCandlesToPricePoints(candles);
    if (!latest?.spot) return points;
    return patchLatestPriceWithOracle(points, latest.spot);
  }, [candles, latest]);

  return {
    data,
    isLoading: enabled && isLoading && !isFetched && data.length === 0,
    isError: enabled && isError && data.length === 0,
    refetch: () => {
      void refetch();
    },
  };
}

/**
 * Chart-only price series: DeepBook OHLCV when a pair exists, with the newest
 * candle close patched to the predict oracle latest spot. Falls back to live
 * oracle polls for assets without a DeepBook pair mapping.
 */
export function useChartPriceSeries(
  oracleId: string,
  asset: string,
  options?: { enabled?: boolean },
) {
  const enabled = Boolean(oracleId) && (options?.enabled ?? true);
  const pair = deepbookPairForAsset(asset);
  const useOhlcv = Boolean(pair);

  const ohlcv = useDeepbookChartSeries(pair ?? "", oracleId, enabled && useOhlcv);
  const oracle = useOracleSpotPriceSeries(oracleId, { enabled: enabled && !useOhlcv });

  if (useOhlcv) return ohlcv;
  return oracle;
}
