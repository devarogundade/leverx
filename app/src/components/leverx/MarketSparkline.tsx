import { useId } from "react";
import { seriesToAreaPath, seriesToPolylinePoints } from "@/lib/charts/sparkline-path";
import { cn } from "@/lib/utils";

interface Props {
  series: readonly number[];
  width?: number | string;
  height?: number;
  viewWidth?: number;
  viewHeight?: number;
  className?: string;
  strokeWidth?: number;
  /** Flush to SVG edges — used for full-width grid card footers. */
  edgeToEdge?: boolean;
}

export function MarketSparkline({
  series: rawSeries,
  width = "100%",
  height = 32,
  viewWidth = 104,
  viewHeight = 20,
  className,
  strokeWidth = 1.5,
  edgeToEdge = false,
}: Props) {
  const rawGradientId = useId();
  const fillGradientId = `markets-sparkline-fill-${rawGradientId.replace(/:/g, "")}`;
  const strokeGradientId = `markets-sparkline-stroke-${rawGradientId.replace(/:/g, "")}`;
  const padding = edgeToEdge ? 0 : 1;

  const series = rawSeries ?? [];
  const points = seriesToPolylinePoints(series, viewWidth, viewHeight, padding);
  const areaPath = seriesToAreaPath(series, viewWidth, viewHeight, padding);

  if (!points) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        className={cn("markets-sparkline block h-full w-full min-w-0 opacity-30", className)}
        aria-hidden
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="none"
      className={cn("markets-sparkline block h-full w-full min-w-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--markets-sparkline-stroke, #d4c5b0)"
            stopOpacity="var(--markets-sparkline-fill-opacity-start, 0.38)"
          />
          <stop
            offset="100%"
            stopColor="var(--markets-sparkline-stroke, #d4c5b0)"
            stopOpacity="var(--markets-sparkline-fill-opacity-end, 0)"
          />
        </linearGradient>
        <linearGradient
          id={strokeGradientId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={viewWidth}
          y2={0}
        >
          <stop
            offset="0%"
            stopColor="var(--markets-sparkline-stroke, #d4c5b0)"
            stopOpacity="var(--markets-sparkline-stroke-opacity-start, 0.35)"
          />
          <stop
            offset="100%"
            stopColor="var(--markets-sparkline-stroke, #d4c5b0)"
            stopOpacity="var(--markets-sparkline-stroke-opacity-end, 1)"
          />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillGradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={`url(#${strokeGradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
