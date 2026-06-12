import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import {
  ohlcvToCandlestickData,
  patchLatestCandleWithOracle,
} from "@/lib/charts/candle-data";
import {
  CHART_OHLCV_INTERVAL,
  CHART_OHLCV_INTERVAL_MS,
  CHART_OHLCV_LOOKBACK_MS,
  deepbookPairForAsset,
  fetchDeepbookOhlcv,
} from "@/lib/deepbook/ohlcv";
import type { PricePoint } from "@/lib/predict/price-point";
import { useOraclePriceLatest, useOracleSpotPriceSeries } from "@/hooks/useOracleSpotPriceSeries";

const OHLCV_REFETCH_MS = 60_000;

export { CHART_OHLCV_INTERVAL_MS };

export type ChartPriceSeriesMode = "candlestick" | "line";

export type ChartPriceSeriesResult = {
  mode: ChartPriceSeriesMode;
  candles: CandlestickData<UTCTimestamp>[];
  linePoints: PricePoint[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

function useDeepbookChartSeries(
  pair: string,
  oracleId: string,
  enabled: boolean,
): ChartPriceSeriesResult {
  const { data: latest } = useOraclePriceLatest(oracleId, { enabled });

  const {
    data: rawCandles,
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

  const candles = useMemo(() => {
    if (!rawCandles?.length) return [];
    const patched = latest?.spot
      ? patchLatestCandleWithOracle(rawCandles, latest.spot)
      : rawCandles;
    return ohlcvToCandlestickData(patched);
  }, [rawCandles, latest]);

  return {
    mode: "candlestick",
    candles,
    linePoints: [],
    isLoading: enabled && isLoading && !isFetched && candles.length === 0,
    isError: enabled && isError && candles.length === 0,
    refetch: () => {
      void refetch();
    },
  };
}

/**
 * Chart price feed: DeepBook OHLCV candlesticks when a pair exists (latest bar
 * patched to predict oracle spot), otherwise live oracle line polls.
 */
export function useChartPriceSeries(
  oracleId: string,
  asset: string,
  options?: { enabled?: boolean },
): ChartPriceSeriesResult {
  const enabled = Boolean(oracleId) && (options?.enabled ?? true);
  const pair = deepbookPairForAsset(asset);
  const useOhlcv = Boolean(pair);

  const ohlcv = useDeepbookChartSeries(pair ?? "", oracleId, enabled && useOhlcv);
  const oracle = useOracleSpotPriceSeries(oracleId, { enabled: enabled && !useOhlcv });

  if (useOhlcv) return ohlcv;

  return {
    mode: "line",
    candles: [],
    linePoints: oracle.data,
    isLoading: oracle.isLoading,
    isError: oracle.isError,
    refetch: oracle.refetch,
  };
}
