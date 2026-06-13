import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { ohlcvTimeToSec, type OhlcvCandle } from "@/lib/deepbook/ohlcv";

export function ohlcvToCandlestickData(
  candles: readonly OhlcvCandle[],
): CandlestickData<UTCTimestamp>[] {
  const byTime = new Map<number, CandlestickData<UTCTimestamp>>();

  for (const [t, open, high, low, close] of candles) {
    if (t <= 0 || !Number.isFinite(close) || close <= 0) continue;
    const time = ohlcvTimeToSec(t) as UTCTimestamp;
    byTime.set(time, {
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
    });
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bar]) => bar);
}

/** Sort ascending and patch the newest bar so close matches the predict oracle spot. */
export function patchLatestCandleWithOracle(
  candles: readonly OhlcvCandle[],
  oracleSpot: number,
): OhlcvCandle[] {
  if (candles.length === 0 || !Number.isFinite(oracleSpot) || oracleSpot <= 0) {
    return [...candles];
  }

  const sorted = [...candles].sort((a, b) => a[0] - b[0]);
  const last = sorted[sorted.length - 1]!;
  const [t, open, high, low, , volume] = last;
  sorted[sorted.length - 1] = [
    t,
    open,
    Math.max(high, open, oracleSpot),
    Math.min(low, open, oracleSpot),
    oracleSpot,
    volume,
  ];
  return sorted;
}
