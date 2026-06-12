import type {
  AutoscaleInfo,
  CandlestickData,
  IChartApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";
import type { PriceLevel } from "@/lib/charts/price-level";

/** Default line viewport when not using fitContent (recent polls only). */
export const PREDICT_DETAIL_VISIBLE_BARS = 90;

/** ~16 hours of 15m OHLCV candles when using a fixed window. */
export const PREDICT_CANDLE_VISIBLE_BARS = 64;

/** Keep price action using most of the plot height. */
export const PREDICT_CHART_SCALE_MARGINS = { top: 0.02, bottom: 0.02 };

/** Tight Y padding so spot movement spreads across the chart. */
const PREDICT_LINE_Y_PAD_RATIO = 0.06;
const PREDICT_CANDLE_Y_PAD_RATIO = 0.05;

export function predictChartTimeScaleOptions(mode: "line" | "candlestick" = "line") {
  return {
    timeVisible: true,
    secondsVisible: mode === "line",
    // Wider bar spacing spreads candles/points horizontally.
    barSpacing: mode === "candlestick" ? 12 : 18,
    minBarSpacing: mode === "candlestick" ? 4 : 8,
    rightOffset: 8,
    fixLeftEdge: false,
    fixRightEdge: false,
  };
}

function yBoundsFromValues(
  values: readonly number[],
  strikeLevels: readonly PriceLevel[],
): { min: number; max: number } | null {
  const strikes = strikeLevels.map((level) => level.price);
  const all = [...values, ...strikes].filter((value) => Number.isFinite(value) && value > 0);
  if (all.length === 0) return null;

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    const bump = Math.max(min * 0.0015, 0.5);
    min -= bump;
    max += bump;
  }
  return { min, max };
}

function withYPadding(
  min: number,
  max: number,
  padRatio: number,
): { minValue: number; maxValue: number } {
  const span = max - min;
  const pad = Math.max(span * padRatio, max * 0.0005);
  return { minValue: min - pad, maxValue: max + pad };
}

export function buildPredictAutoscaleInfo(
  lineData: readonly LineData<UTCTimestamp>[],
  strikeLevels: readonly PriceLevel[],
): AutoscaleInfo | null {
  const bounds = yBoundsFromValues(
    lineData.map((point) => point.value),
    strikeLevels,
  );
  if (!bounds) return null;
  return { priceRange: withYPadding(bounds.min, bounds.max, PREDICT_LINE_Y_PAD_RATIO) };
}

export function buildCandleAutoscaleInfo(
  candles: readonly CandlestickData<UTCTimestamp>[],
  strikeLevels: readonly PriceLevel[],
): AutoscaleInfo | null {
  const lows = candles.map((bar) => bar.low);
  const highs = candles.map((bar) => bar.high);
  const bounds = yBoundsFromValues([...lows, ...highs], strikeLevels);
  if (!bounds) return null;
  return { priceRange: withYPadding(bounds.min, bounds.max, PREDICT_CANDLE_Y_PAD_RATIO) };
}

/** Spread the full series across the time axis. */
export function applyPredictChartViewport(
  chart: IChartApi,
  dataLength: number,
  mode: "line" | "candlestick" = "line",
): void {
  chart.timeScale().applyOptions(predictChartTimeScaleOptions(mode));

  if (dataLength < 2) {
    chart.timeScale().fitContent();
    return;
  }

  chart.timeScale().fitContent();
}
