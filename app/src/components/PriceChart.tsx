import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/copy";
import type { PriceLevel } from "@/lib/charts/price-level";
import {
  buildOptionsLineSegments,
  strikeCenteredVisibleRange,
} from "@/lib/charts/options-line-segments";
import {
  levelLineColor,
  levelLineStyle,
  lineSeriesLossColor,
  lineSeriesWinColor,
  lightweightChartOptions,
} from "@/lib/charts/lightweight-shared";
import { flatLineData, toLineData } from "@/lib/charts/line-data";
import type { PredictSide } from "@/lib/predict/instruments";
import { fetchPredictOraclePriceHistory } from "@/lib/predict/price-history";
import { cn } from "@/lib/utils";
import { tradeSurface } from "@/lib/leverx/tw";

interface Props {
  asset: string;
  pair?: string;
  oracleId: string;
  spotPrice?: number | null;
  levels?: PriceLevel[];
  /** Scaled strike for options-style chart (centers strike line, win/loss coloring). */
  strikePrice?: number;
  activeSide?: PredictSide;
  rangeLower?: number;
  rangeUpper?: number;
  height?: number;
  className?: string;
}

function resolveFlatPrice(spotPrice: number | null | undefined, levels?: PriceLevel[]): number | null {
  if (spotPrice != null && spotPrice > 0) return spotPrice;
  const level = levels?.find((l) => l.price > 0);
  return level?.price ?? null;
}

export function PriceChart({
  asset,
  pair,
  oracleId,
  spotPrice,
  levels,
  strikePrice,
  activeSide = "up",
  rangeLower,
  rangeUpper,
  height,
  className,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const segmentRefs = useRef<ISeriesApi<"Line">[]>([]);

  const optionsMode = strikePrice != null && strikePrice > 0;

  const { data: history, isLoading, isError, refetch } = useQuery({
    queryKey: ["predict-oracle-prices", oracleId],
    queryFn: () => fetchPredictOraclePriceHistory(oracleId),
    staleTime: 120_000,
    enabled: Boolean(oracleId),
  });

  const flatPrice = useMemo(() => resolveFlatPrice(spotPrice, levels), [spotPrice, levels]);

  const lineData = useMemo(() => {
    if (history?.length) return toLineData(history);
    if (flatPrice != null) return flatLineData(flatPrice);
    return [];
  }, [history, flatPrice]);

  const coloredSegments = useMemo(() => {
    if (!optionsMode || lineData.length === 0) return null;
    const range =
      activeSide === "range" && rangeLower != null && rangeUpper != null
        ? { lower: rangeLower, upper: rangeUpper }
        : undefined;
    return buildOptionsLineSegments(lineData, activeSide, strikePrice!, range);
  }, [optionsMode, lineData, activeSide, strikePrice, rangeLower, rangeUpper]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const el = containerRef.current;
    const chart = createChart(el, lightweightChartOptions(el.clientWidth, el.clientHeight));
    chartRef.current = chart;
    segmentRefs.current = [];

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height: h } = entry.contentRect;
      chart.applyOptions({ width, height: h });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      segmentRefs.current = [];
    };
  }, [mounted, oracleId]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const series of segmentRefs.current) {
      chart.removeSeries(series);
    }
    segmentRefs.current = [];

    if (lineData.length === 0) return;

    const addSeries = (color: string, data: typeof lineData) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      series.setData(data);
      segmentRefs.current.push(series);
      return series;
    };

    if (optionsMode && coloredSegments && coloredSegments.length > 0) {
      for (const segment of coloredSegments) {
        const color = segment.tone === "win" ? lineSeriesWinColor() : lineSeriesLossColor();
        addSeries(color, segment.data);
      }
    } else {
      addSeries(lineSeriesWinColor(), lineData);
    }

    chart.timeScale().fitContent();

    if (optionsMode && strikePrice != null && strikePrice > 0) {
      const prices = lineData.map((point) => point.value);
      const { from, to } = strikeCenteredVisibleRange(prices, strikePrice);
      chart.priceScale("right").setVisibleRange({ from, to });
    }
  }, [lineData, coloredSegments, optionsMode, strikePrice]);

  useEffect(() => {
    const chart = chartRef.current;
    const primarySeries = segmentRefs.current[0];
    if (!chart || !primarySeries) return;

    const priceLines =
      levels?.map((level) =>
        primarySeries.createPriceLine({
          price: level.price,
          color: levelLineColor(level.tone),
          lineWidth: level.tone === "strike" ? 2 : 1,
          lineStyle: levelLineStyle(level.tone),
          axisLabelVisible: true,
          title: level.label,
        }),
      ) ?? [];

    return () => {
      for (const line of priceLines) {
        primarySeries.removePriceLine(line);
      }
    };
  }, [levels, lineData, coloredSegments]);

  const chartLabel = pair ?? `${asset}/USDT`;
  const showChart = mounted && !isLoading && !isError && lineData.length > 0;

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
            title="Could not load price data"
            description="The oracle feed may be temporarily unavailable."
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
