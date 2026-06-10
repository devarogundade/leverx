import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchOraclePriceLatest } from "@/lib/predict/client";
import type { PricePoint } from "@/lib/predict/price-point";

export const ORACLE_SPOT_POLL_INTERVAL_MS = 5_000;
const MAX_SERIES_POINTS = 720;

export const ORACLE_PRICE_LATEST_QUERY_KEY = "predict-oracle-price-latest";

export function oraclePriceLatestQueryKey(oracleId: string) {
  return [ORACLE_PRICE_LATEST_QUERY_KEY, oracleId] as const;
}

function polledPricePoint(
  latest: { spot: number; timestampMs?: number },
  last?: PricePoint,
): PricePoint {
  let t = latest.timestampMs ?? Date.now();
  if (last) {
    if (t <= last.t) t = Date.now();
    if (t <= last.t) t = last.t + 1_000;
  }
  return { t, price: latest.spot };
}

function appendPricePoint(prev: PricePoint[], point: PricePoint): PricePoint[] {
  const last = prev[prev.length - 1];
  const next =
    last && last.t === point.t
      ? [...prev.slice(0, -1), point]
      : [...prev, point];
  next.sort((a, b) => a.t - b.t);
  return next.length > MAX_SERIES_POINTS ? next.slice(-MAX_SERIES_POINTS) : next;
}

/** Shared poll for `GET /oracles/:id/prices/latest` (deduped via React Query). */
export function useOraclePriceLatest(
  oracleId: string,
  options?: { enabled?: boolean },
) {
  const enabled = Boolean(oracleId) && (options?.enabled ?? true);

  return useQuery({
    queryKey: oraclePriceLatestQueryKey(oracleId),
    queryFn: () => fetchOraclePriceLatest(oracleId),
    enabled,
    staleTime: ORACLE_SPOT_POLL_INTERVAL_MS / 2,
    refetchInterval: enabled ? ORACLE_SPOT_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

/** Live oracle spot series built from shared latest-price polls. */
export function useOracleSpotPriceSeries(
  oracleId: string,
  options?: { enabled?: boolean },
) {
  const enabled = Boolean(oracleId) && (options?.enabled ?? true);
  const {
    data: latest,
    isLoading,
    isError,
    isFetched,
    refetch,
  } = useOraclePriceLatest(oracleId, { enabled });

  const [points, setPoints] = useState<PricePoint[]>([]);

  useEffect(() => {
    setPoints([]);
  }, [oracleId]);

  useEffect(() => {
    if (!latest) return;
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      return appendPricePoint(prev, polledPricePoint(latest, last));
    });
  }, [latest]);

  return {
    data: points,
    isLoading: enabled && isLoading && !isFetched && points.length === 0,
    isError: enabled && isError && points.length === 0,
    refetch: () => {
      void refetch();
    },
  };
}
