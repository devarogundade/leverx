import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/copy";
import { buildStrikeChartLevels } from "@/lib/charts/predict-chart-levels";
import {
  candlestickDownColor,
  candlestickUpColor,
  levelLineColor,
  levelLineStyle,
  lineSeriesWinColor,
  lightweightChartOptions,
} from "@/lib/charts/lightweight-shared";
import { buildStrikeAnchoredSpotLineData } from "@/lib/charts/line-data";
import {
  applyPredictChartViewport,
  buildCandleAutoscaleInfo,
  buildPredictAutoscaleInfo,
  PREDICT_CHART_SCALE_MARGINS,
} from "@/lib/charts/predict-chart-view";
import {
  CHART_OHLCV_INTERVAL_MS,
  useChartPriceSeries,
  type ChartPriceSeriesResult,
} from "@/hooks/useChartPriceSeries";
import type { PredictSide } from "@/lib/predict/instruments";
import { cn } from "@/lib/utils";
import { tradeSurface } from "@/lib/leverx/tw";

interface Props {
  asset: string;
  pair?: string;
  oracleId: string;
  /** When provided, skips internal chart data hook (share one series per page). */
  chartSeries?: ChartPriceSeriesResult;
  /** Scaled strike for UP/DOWN. */
  strikePrice?: number;
  activeSide?: PredictSide;
  /** Scaled range bounds for RANGE. */
  rangeLower?: number;
  rangeUpper?: number;
  height?: number;
  /** When false (e.g. mobile tab hidden), skip resize until visible again */
  layoutActive?: boolean;
  className?: string;
}

function applyChartSize(chart: IChartApi, el: HTMLElement): boolean {
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (width < 2 || height < 2) return false;
  chart.resize(width, height);
  return true;
}

export function PriceChart({
  asset,
  pair,
  oracleId,
  chartSeries: chartSeriesProp,
  strikePrice,
  activeSide = "up",
  rangeLower,
  rangeUpper,
  height,
  layoutActive = true,
  className,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(null);
  const seriesModeRef = useRef<"line" | "candlestick" | null>(null);
  const dataLenRef = useRef(0);
  const strikeKeyRef = useRef("");
  const lineDataRef = useRef<LineData<UTCTimestamp>[]>([]);
  const candleDataRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const strikeLevelsRef = useRef<ReturnType<typeof buildStrikeChartLevels>>([]);

  const internalSeries = useChartPriceSeries(oracleId, asset, {
    enabled: chartSeriesProp === undefined,
  });
  const chartSeries = chartSeriesProp ?? internalSeries;
  const { mode, candles, linePoints, isLoading, isError, refetch } = chartSeries;

  const lineData = useMemo(() => {
    if (mode !== "line" || !linePoints.length) return [];

    const anchorStrike = activeSide === "range" ? undefined : strikePrice;
    return buildStrikeAnchoredSpotLineData(
      linePoints,
      anchorStrike,
      CHART_OHLCV_INTERVAL_MS,
    );
  }, [mode, linePoints, strikePrice, activeSide]);

  const candleData = mode === "candlestick" ? candles : [];
  const hasData = mode === "candlestick" ? candleData.length > 0 : lineData.length > 0;
  const dataLength = mode === "candlestick" ? candleData.length : lineData.length;

  const strikeLevels = useMemo(
    () =>
      buildStrikeChartLevels({
        activeSide,
        strikePrice,
        rangeLower,
        rangeUpper,
      }),
    [activeSide, strikePrice, rangeLower, rangeUpper],
  );

  lineDataRef.current = lineData;
  candleDataRef.current = candleData;
  strikeLevelsRef.current = strikeLevels;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const el = containerRef.current;
    const chart = createChart(
      el,
      lightweightChartOptions(
        Math.max(el.clientWidth, 1),
        Math.max(el.clientHeight, 240),
        PREDICT_CHART_SCALE_MARGINS,
      ),
    );
    chartRef.current = chart;
    priceSeriesRef.current = null;
    seriesModeRef.current = null;

    const ro = new ResizeObserver(() => {
      if (chartRef.current) applyChartSize(chartRef.current, el);
    });
    ro.observe(el);

    let raf = 0;
    const ensureSize = () => {
      if (!chartRef.current) return;
      if (!applyChartSize(chartRef.current, el)) {
        raf = requestAnimationFrame(ensureSize);
      }
    };
    raf = requestAnimationFrame(ensureSize);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      seriesModeRef.current = null;
      dataLenRef.current = 0;
      strikeKeyRef.current = "";
    };
  }, [mounted, oracleId]);

  useEffect(() => {
    if (!layoutActive || !mounted) return;
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;

    const resize = () => applyChartSize(chart, el);
    resize();
    const raf = requestAnimationFrame(resize);
    const timer = window.setTimeout(resize, 120);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [layoutActive, mounted, dataLength]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !hasData) return;

    const strikeKey = `${activeSide}:${strikePrice ?? 0}:${rangeLower ?? 0}:${rangeUpper ?? 0}`;
    const strikeChanged = strikeKeyRef.current !== strikeKey;
    strikeKeyRef.current = strikeKey;

    const prevLen = dataLenRef.current;
    const grew = dataLength > prevLen;
    const sameMode = seriesModeRef.current === mode;
    const canLineStreamUpdate =
      sameMode &&
      !strikeChanged &&
      grew &&
      prevLen > 0 &&
      priceSeriesRef.current &&
      mode === "line";

    if (canLineStreamUpdate) {
      const series = priceSeriesRef.current as ISeriesApi<"Line">;
      for (const point of lineData.slice(prevLen)) {
        series.update(point);
      }
      dataLenRef.current = dataLength;
      applyPredictChartViewport(chart, dataLength, mode);
      return;
    }

    const canCandleStreamUpdate =
      sameMode &&
      !strikeChanged &&
      mode === "candlestick" &&
      priceSeriesRef.current &&
      dataLength > 0 &&
      dataLength === prevLen;

    if (canCandleStreamUpdate) {
      const series = priceSeriesRef.current as ISeriesApi<"Candlestick">;
      series.update(candleData[candleData.length - 1]!);
      return;
    }

    if (priceSeriesRef.current) {
      chart.removeSeries(priceSeriesRef.current);
      priceSeriesRef.current = null;
      seriesModeRef.current = null;
    }

    if (mode === "candlestick") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: candlestickUpColor(),
        downColor: candlestickDownColor(),
        borderVisible: false,
        wickUpColor: candlestickUpColor(),
        wickDownColor: candlestickDownColor(),
        lastValueVisible: true,
        priceLineVisible: false,
        autoscaleInfoProvider: () =>
          buildCandleAutoscaleInfo(candleDataRef.current, strikeLevelsRef.current),
      });
      series.setData(candleData);
      priceSeriesRef.current = series;
      seriesModeRef.current = "candlestick";
    } else {
      const series = chart.addSeries(LineSeries, {
        color: lineSeriesWinColor(),
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
        autoscaleInfoProvider: () =>
          buildPredictAutoscaleInfo(lineDataRef.current, strikeLevelsRef.current),
      });
      series.setData(lineData);
      priceSeriesRef.current = series;
      seriesModeRef.current = "line";
    }

    dataLenRef.current = dataLength;
    applyPredictChartViewport(chart, dataLength, mode);
    chart.priceScale("right").applyOptions({ autoScale: true });
  }, [mode, lineData, candleData, dataLength, hasData, activeSide, strikePrice, rangeLower, rangeUpper]);

  useEffect(() => {
    const series = priceSeriesRef.current;
    if (!series) return;

    const priceLines = strikeLevels.map((level) =>
      series.createPriceLine({
        price: level.price,
        color: levelLineColor(level.tone),
        lineWidth: 2,
        lineStyle: levelLineStyle(level.tone),
        axisLabelVisible: true,
        title: level.label,
      }),
    );

    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });

    return () => {
      for (const line of priceLines) {
        series.removePriceLine(line);
      }
    };
  }, [strikeLevels, lineData, candleData]);

  const chartLabel = pair ?? `${asset}/USDC`;
  const showChart = mounted && !isLoading && !isError && hasData;

  return (
    <div
      className={cn(
        tradeSurface,
        "relative flex flex-col",
        height == null && "h-full min-h-0",
        className,
      )}
      style={height != null ? { height } : undefined}
      aria-label={`${chartLabel} price chart`}
    >
      {(!mounted || isLoading) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/90 backdrop-blur-[2px]">
          <LoadingState label={ui.loadingChart} compact />
        </div>
      )}
      {mounted && isError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/90 p-4">
          <EmptyState
            icon={LineChart}
            title="Could not load chart"
            description="Price data may be temporarily unavailable. Try again in a moment."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
            compact
          />
        </div>
      )}
      <div
        ref={containerRef}
        className={cn("h-full w-full", (isLoading || isError) && "opacity-0")}
      />
      {showChart && (
        <a
          href="https://www.tradingview.com"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-1 left-2 z-10 text-[9px] text-muted-foreground/70 hover:text-muted-foreground"
        >
          Chart by TradingView
        </a>
      )}
    </div>
  );
}
