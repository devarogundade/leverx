import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PricePoint } from "@/lib/predict/price-point";

function candleTime(timestamp: number): UTCTimestamp {
  const sec = timestamp > 1e12 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  return sec as UTCTimestamp;
}

/** Price history points → ascending unique timestamps for Lightweight Charts. */
export function toLineData(points: readonly PricePoint[]): LineData<UTCTimestamp>[] {
  const byTime = new Map<number, number>();
  for (const p of points) {
    const sec = candleTime(p.t);
    byTime.set(sec, p.price);
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}
