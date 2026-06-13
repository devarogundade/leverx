import type { IChartApi, LogicalRange } from "lightweight-charts";

export type SavedChartViewport = {
  logicalRange: LogicalRange | null;
  autoScale: boolean;
};

/** Tracks user pan/zoom so live data updates can avoid fitContent(). */
export function createChartViewportGuard(chart: IChartApi) {
  let preserve = false;
  let applying = false;

  const onVisibleLogicalRangeChange = () => {
    if (applying) return;
    preserve = true;
  };

  chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);

  return {
    shouldPreserve: () => preserve,
    reset: () => {
      preserve = false;
    },
    save: (): SavedChartViewport => ({
      logicalRange: chart.timeScale().getVisibleLogicalRange() ?? null,
      autoScale: chart.priceScale("right").options().autoScale ?? true,
    }),
    restore: (saved: SavedChartViewport) => {
      if (!saved.logicalRange) return;
      applying = true;
      chart.timeScale().setVisibleLogicalRange(saved.logicalRange);
      chart.priceScale("right").applyOptions({ autoScale: saved.autoScale });
      applying = false;
    },
    applyProgrammatic: (fn: () => void) => {
      applying = true;
      try {
        fn();
      } finally {
        applying = false;
      }
    },
    destroy: () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
    },
  };
}

/** True when the viewport is pinned to the live edge (follow mode). */
export function isChartNearRightEdge(
  chart: IChartApi,
  dataLength: number,
  thresholdBars = 4,
): boolean {
  if (dataLength < 2) return true;
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return true;
  return range.to >= dataLength - thresholdBars;
}

/** Nudge the time scale so new bars stay visible without fitContent(). */
export function followChartRightEdge(chart: IChartApi, addedBars: number): void {
  if (addedBars <= 0) return;
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return;
  chart.timeScale().setVisibleLogicalRange({
    from: range.from + addedBars,
    to: range.to + addedBars,
  });
}
