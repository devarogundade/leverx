import { useCallback, useEffect, useState } from "react";
import { fetchOraclePriceLatest } from "@/lib/predict/client";
import type { PricePoint } from "@/lib/predict/price-point";

export const ORACLE_SPOT_POLL_INTERVAL_MS = 5_000;
const MAX_SERIES_POINTS = 720;

function polledPricePoint(latest: { spot: number }): PricePoint {
  return { t: Date.now(), price: latest.spot };
}

function appendPricePoint(prev: PricePoint[], point: PricePoint): PricePoint[] {
  const next = [...prev, point].sort((a, b) => a.t - b.t);
  return next.length > MAX_SERIES_POINTS ? next.slice(-MAX_SERIES_POINTS) : next;
}

/** Live oracle spot series from `GET /oracles/:id/prices/latest` (polled). */
export function useOracleSpotPriceSeries(oracleId: string) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(oracleId));
  const [isError, setIsError] = useState(false);

  const poll = useCallback(async () => {
    if (!oracleId) return false;

    const latest = await fetchOraclePriceLatest(oracleId);
    if (!latest) return false;

    setPoints((prev) => appendPricePoint(prev, polledPricePoint(latest)));
    setIsError(false);
    setIsLoading(false);
    return true;
  }, [oracleId]);

  useEffect(() => {
    if (!oracleId) {
      setPoints([]);
      setIsLoading(false);
      setIsError(false);
      return;
    }

    setPoints([]);
    setIsLoading(true);
    setIsError(false);

    let cancelled = false;

    const tick = async () => {
      try {
        const ok = await poll();
        if (!cancelled && !ok) {
          setPoints((prev) => {
            if (prev.length === 0) setIsError(true);
            return prev;
          });
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPoints((prev) => {
            if (prev.length === 0) setIsError(true);
            return prev;
          });
          setIsLoading(false);
        }
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, ORACLE_SPOT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [oracleId, poll]);

  return {
    data: points,
    isLoading,
    isError,
    refetch: poll,
  };
}
