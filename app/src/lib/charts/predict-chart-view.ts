import type { AutoscaleInfo, IChartApi, LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceLevel } from "@/lib/charts/price-level";

/** ~7.5 minutes of 5s polls — recent window for a zoomed detail view. */
export const PREDICT_DETAIL_VISIBLE_BARS = 90;

export const PREDICT_CHART_SCALE_MARGINS = { top: 0.02, bottom: 0.02 };

export function predictChartTimeScaleOptions() {
  return {
    timeVisible: true,
    secondsVisible: true,
    barSpacing: 14,
    minBarSpacing: 10,
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

/** Zoom the time axis to the most recent polls with wider bar spacing. */
export function applyPredictChartViewport(chart: IChartApi, dataLength: number): void {
  chart.timeScale().applyOptions(predictChartTimeScaleOptions());

  if (dataLength < 2) {
    chart.timeScale().fitContent();
    return;
  }

  const to = dataLength - 0.5;
  const from = Math.max(0, dataLength - PREDICT_DETAIL_VISIBLE_BARS);
  chart.timeScale().setVisibleLogicalRange({ from, to });
}
