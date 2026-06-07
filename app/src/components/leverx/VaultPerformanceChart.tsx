import { useEffect, useMemo, useRef, useState } from "react";
import { LineSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/copy";
import {
  lineSeriesAccentColor,
  lightweightChartOptions,
} from "@/lib/charts/lightweight-shared";
import {
  flatChartLine,
  vaultSnapshotsToAprLine,
  vaultSnapshotsToTvlLine,
} from "@/lib/charts/vault-line-data";
import type { VaultSnapshot } from "@/lib/leverx/indexer-client";
import {
  labelCaps,
  pillToggleActive,
  pillToggleBtn,
  pillToggleGroup,
  pillToggleIdle,
  tradeSurface,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

type ChartMode = "tvl" | "apr";

interface Props {
  snapshots?: VaultSnapshot[];
  loading?: boolean;
  className?: string;
}

export function VaultPerformanceChart({ snapshots = [], loading, className }: Props) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ChartMode>("tvl");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);

  const lineData = useMemo(() => {
    const fromIndexer =
      mode === "tvl" ? vaultSnapshotsToTvlLine(snapshots) : vaultSnapshotsToAprLine(snapshots);
    if (fromIndexer.length > 0) return fromIndexer;
    return flatChartLine(0);
  }, [snapshots, mode]);

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
  }, [mounted]);

  useEffect(() => {
    const lineSeries = lineRef.current;
    if (!lineSeries) return;

    lineSeries.setData(lineData);
    chartRef.current?.timeScale().fitContent();
  }, [lineData]);

  return (
    <div className={cn(tradeSurface, "flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className={labelCaps}>{ui.vaultChartTitle}</span>
        <div className={pillToggleGroup} role="group" aria-label="Vault chart metric">
          {(
            [
              { id: "tvl" as const, label: ui.vaultChartTvl },
              { id: "apr" as const, label: ui.vaultChartApr },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={cn(pillToggleBtn, mode === id ? pillToggleActive : pillToggleIdle)}
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[280px] min-h-[280px] w-full sm:h-[320px]">
        {(!mounted || loading) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/90">
            <LoadingState label={ui.loadingVault} compact />
          </div>
        )}
        <div ref={containerRef} className={cn("h-full w-full", loading && "opacity-40")} />
      </div>
    </div>
  );
}
