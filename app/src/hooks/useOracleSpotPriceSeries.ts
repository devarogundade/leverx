import { useCallback, useEffect, useState } from "react";
import { fetchOraclePriceLatest } from "@/lib/predict/client";
import type { PricePoint } from "@/lib/predict/price-point";

export const ORACLE_SPOT_POLL_INTERVAL_MS = 5_000;
const MAX_SERIES_POINTS = 720;

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

/** Live oracle spot series from `GET /oracles/:id/prices/latest` (polled). */
export function useOracleSpotPriceSeries(oracleId: string) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(oracleId));
  const [isError, setIsError] = useState(false);

  const poll = useCallback(async () => {
    if (!oracleId) return false;

    const latest = await fetchOraclePriceLatest(oracleId);
    if (!latest) return false;

    setPoints((prev) => {
      const last = prev[prev.length - 1];
      return appendPricePoint(prev, polledPricePoint(latest, last));
    });
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
