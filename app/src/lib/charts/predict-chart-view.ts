import type {
  AutoscaleInfo,
  CandlestickData,
  IChartApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";
import type { PriceLevel } from "@/lib/charts/price-level";

/** ~7.5 minutes of 5s polls — recent window for a zoomed detail view. */
export const PREDICT_DETAIL_VISIBLE_BARS = 90;

/** ~16 hours of 15m OHLCV candles in the default viewport. */
export const PREDICT_CANDLE_VISIBLE_BARS = 64;

export const PREDICT_CHART_SCALE_MARGINS = { top: 0.02, bottom: 0.02 };

export function predictChartTimeScaleOptions(mode: "line" | "candlestick" = "line") {
  return {
    timeVisible: true,
    secondsVisible: mode === "line",
    barSpacing: mode === "candlestick" ? 9 : 14,
    minBarSpacing: mode === "candlestick" ? 4 : 10,
    rightOffset: 6,
    fixLeftEdge: false,
    fixRightEdge: false,
  };
}

export function buildPredictAutoscaleInfo(
  lineData: readonly LineData<UTCTimestamp>[],
  strikeLevels: readonly PriceLevel[],
): AutoscaleInfo | null {
  const values = lineData.map((point) => point.value);
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

  const span = max - min;
  const pad = Math.max(span * 0.14, max * 0.001);
  return {
    priceRange: {
      minValue: min - pad,
      maxValue: max + pad,
    },
  };
}

export function buildCandleAutoscaleInfo(
  candles: readonly CandlestickData<UTCTimestamp>[],
  strikeLevels: readonly PriceLevel[],
): AutoscaleInfo | null {
  const lows = candles.map((bar) => bar.low);
  const highs = candles.map((bar) => bar.high);
  const strikes = strikeLevels.map((level) => level.price);
  const all = [...lows, ...highs, ...strikes].filter((value) => Number.isFinite(value) && value > 0);
  if (all.length === 0) return null;

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    const bump = Math.max(min * 0.0015, 0.5);
    min -= bump;
    max += bump;
  }

  const span = max - min;
  const pad = Math.max(span * 0.08, max * 0.001);
  return {
    priceRange: {
      minValue: min - pad,
      maxValue: max + pad,
    },
  };
}

/** Zoom the time axis to the most recent bars. */
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

  const window =
    mode === "candlestick" ? PREDICT_CANDLE_VISIBLE_BARS : PREDICT_DETAIL_VISIBLE_BARS;
  const to = dataLength - 0.5;
  const from = Math.max(0, dataLength - window);
  chart.timeScale().setVisibleLogicalRange({ from, to });
}
