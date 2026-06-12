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

/** Vertical breathing room on the price scale (lightweight-charts scaleMargins). */
export const PREDICT_CHART_SCALE_MARGINS = { top: 0.14, bottom: 0.14 };

/** Extra Y padding as a fraction of the computed span. */
const PREDICT_LINE_Y_PAD_RATIO = 0.28;
const PREDICT_CANDLE_Y_PAD_RATIO = 0.18;

/** Minimum half-height around a range band so lower/upper strikes do not collapse. */
const RANGE_BAND_HALF_SPAN_MULT = 5;
const RANGE_BAND_MIN_HALF_SPAN_PCT = 0.003;

/** Minimum half-height around a single strike vs spot. */
const STRIKE_MIN_HALF_SPAN_PCT = 0.004;

/** Recent polls used for Y-axis when a range band is shown (ignore older spot history). */
const RANGE_AUTOSCALE_RECENT_POINTS = 24;

function positiveValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function rangeBandFromLevels(strikeLevels: readonly PriceLevel[]): { lower: number; upper: number } | null {
  const strikes = positiveValues(strikeLevels.map((level) => level.price));
  if (strikes.length < 2) return null;
  return { lower: Math.min(...strikes), upper: Math.max(...strikes) };
}

function expandBounds(min: number, max: number, padRatio: number): { minValue: number; maxValue: number } {
  if (min === max) {
    const bump = Math.max(min * 0.0015, 0.5);
    min -= bump;
    max += bump;
  }
  const span = max - min;
  const pad = Math.max(span * padRatio, max * 0.0008);
  return { minValue: min - pad, maxValue: max + pad };
}

/**
 * Y-axis bounds that keep prediction strikes readable.
 * Range markets zoom in on the band; binary markets keep strike near center.
 */
function computePredictYBounds(
  values: readonly number[],
  strikeLevels: readonly PriceLevel[],
): { min: number; max: number } | null {
  const band = rangeBandFromLevels(strikeLevels);
  const scopedValues =
    band && values.length > RANGE_AUTOSCALE_RECENT_POINTS
      ? values.slice(-RANGE_AUTOSCALE_RECENT_POINTS)
      : values;
  const spots = positiveValues(scopedValues);
  const strikes = positiveValues(strikeLevels.map((level) => level.price));

  if (band) {
    const { lower, upper } = band;
    const width = upper - lower;
    const center = (lower + upper) / 2;
    const minHalfSpan = Math.max(
      width * RANGE_BAND_HALF_SPAN_MULT,
      center * RANGE_BAND_MIN_HALF_SPAN_PCT,
      width + Math.max(center * 0.001, 1),
    );

    let min = lower - minHalfSpan;
    let max = upper + minHalfSpan;

    const latestSpot = spots.length > 0 ? spots[spots.length - 1] : null;
    if (latestSpot != null) {
      min = Math.min(min, latestSpot);
      max = Math.max(max, latestSpot);
    }

    const minSpan = width + minHalfSpan * 2;
    const span = max - min;
    if (span < minSpan) {
      min = center - minSpan / 2;
      max = center + minSpan / 2;
    } else if (span > minSpan * 1.4) {
      min = center - minSpan / 2;
      max = center + minSpan / 2;
      if (latestSpot != null) {
        if (latestSpot < min) min = latestSpot - width * 0.5;
        if (latestSpot > max) max = latestSpot + width * 0.5;
      }
    }

    return { min, max };
  }

  if (strikes.length === 1) {
    const strike = strikes[0]!;
    const spotMid =
      spots.length > 0 ? (Math.min(...spots) + Math.max(...spots)) / 2 : strike;
    const minHalfSpan = Math.max(
      strike * STRIKE_MIN_HALF_SPAN_PCT,
      Math.abs(spotMid - strike) * 1.75 + strike * 0.001,
      2,
    );

    let min = Math.min(strike, ...(spots.length ? spots : [strike])) - minHalfSpan;
    let max = Math.max(strike, ...(spots.length ? spots : [strike])) + minHalfSpan;

    const span = max - min;
    const minSpan = minHalfSpan * 2;
    if (span < minSpan) {
      const mid = (min + max) / 2;
      min = mid - minSpan / 2;
      max = mid + minSpan / 2;
    }

    return { min, max };
  }

  const all = [...spots, ...strikes];
  if (all.length === 0) return null;

  return { min: Math.min(...all), max: Math.max(...all) };
}

export function buildPredictAutoscaleInfo(
  lineData: readonly LineData<UTCTimestamp>[],
  strikeLevels: readonly PriceLevel[],
): AutoscaleInfo | null {
  const values = lineData.map((point) => point.value);
  const bounds = computePredictYBounds(values, strikeLevels);
  if (!bounds) return null;

  const range = expandBounds(bounds.min, bounds.max, PREDICT_LINE_Y_PAD_RATIO);
  return { priceRange: range };
}

export function buildCandleAutoscaleInfo(
  candles: readonly CandlestickData<UTCTimestamp>[],
  strikeLevels: readonly PriceLevel[],
): AutoscaleInfo | null {
  const lows = candles.map((bar) => bar.low);
  const highs = candles.map((bar) => bar.high);
  const bounds = computePredictYBounds([...lows, ...highs], strikeLevels);
  if (!bounds) return null;

  const range = expandBounds(bounds.min, bounds.max, PREDICT_CANDLE_Y_PAD_RATIO);
  return { priceRange: range };
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
