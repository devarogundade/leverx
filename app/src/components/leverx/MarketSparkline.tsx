import { seriesToPolylinePoints } from "@/lib/charts/sparkline-path";
import { cn } from "@/lib/utils";

interface Props {
  series: readonly number[];
  positive?: boolean;
  width?: number | string;
  height?: number;
  viewWidth?: number;
  viewHeight?: number;
  className?: string;
  strokeWidth?: number;
}

export function MarketSparkline({
  series: rawSeries,
  positive = true,
  width = "100%",
  height = 32,
  viewWidth = 104,
  viewHeight = 20,
  className,
  strokeWidth = 1.5,
}: Props) {
  const series = rawSeries ?? [];
  const points = seriesToPolylinePoints(series, viewWidth, viewHeight);
  const up =
    positive !== undefined
      ? positive
      : series.length < 2
        ? true
        : (series[series.length - 1] ?? 0) >= (series[0] ?? 0);

  if (!points) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        className={cn("markets-sparkline block opacity-30", className)}
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
      className={cn("markets-sparkline block", className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? "var(--color-success)" : "var(--color-destructive)"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
