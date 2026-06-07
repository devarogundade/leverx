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
  levelLineColor,
  levelLineStyle,
  lightweightChartOptions,
  lineSeriesAccentColor,
} from "@/lib/charts/lightweight-shared";
import { toLineData } from "@/lib/charts/line-data";
import { fetchPredictOraclePriceHistory } from "@/lib/predict/price-history";
import { cn } from "@/lib/utils";
import { tradeSurface } from "@/lib/leverx/tw";

interface Props {
  asset: string;
  pair?: string;
  oracleId: string;
  levels?: PriceLevel[];
  height?: number;
  className?: string;
}

export function PriceChart({
  asset,
  pair,
  oracleId,
  levels,
  height,
  className,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const { data: history, isLoading, isError, refetch } = useQuery({
    queryKey: ["predict-oracle-prices", oracleId],
    queryFn: () => fetchPredictOraclePriceHistory(oracleId),
    staleTime: 120_000,
    enabled: Boolean(oracleId),
  });

  const lineData = useMemo(
    () => (history?.length ? toLineData(history) : []),
    [history],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const el = containerRef.current;
    const chart = createChart(el, lightweightChartOptions(el.clientWidth, el.clientHeight));
    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: lineSeriesAccentColor(),
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    lineRef.current = lineSeries;

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
      lineRef.current = null;
    };
  }, [mounted, oracleId]);

  useEffect(() => {
    const lineSeries = lineRef.current;
    if (!lineSeries) return;

    if (lineData.length === 0) {
      lineSeries.setData([]);
      return;
    }

    lineSeries.setData(lineData);
    chartRef.current?.timeScale().fitContent();
  }, [lineData]);

  useEffect(() => {
    const lineSeries = lineRef.current;
    if (!lineSeries) return;

    const priceLines =
      levels?.map((level) =>
        lineSeries.createPriceLine({
          price: level.price,
          color: levelLineColor(level.tone),
          lineWidth: 2,
          lineStyle: levelLineStyle(level.tone),
          axisLabelVisible: true,
          title: level.label,
        }),
      ) ?? [];

    return () => {
      for (const line of priceLines) {
        lineSeries.removePriceLine(line);
      }
    };
  }, [levels, lineData]);

  const chartLabel = pair ?? `${asset}/USDT`;
  const empty = !isLoading && lineData.length === 0;

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
      {mounted && empty && !isError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/90 p-4">
          <EmptyState
            icon={LineChart}
            title={ui.emptyChart}
            description={ui.emptyChartHint}
            compact
          />
        </div>
      )}
      <div
        ref={containerRef}
        className={cn("h-full w-full", (isLoading || isError || empty) && "opacity-0")}
      />
      {mounted && lineData.length > 0 && (
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
