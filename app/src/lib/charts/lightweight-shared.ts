import { ColorType, CrosshairMode, LineStyle, type DeepPartial, type ChartOptions } from "lightweight-charts";
import type { PriceLevel } from "@/lib/charts/price-level";

export function levelLineColor(tone: PriceLevel["tone"]): string {
  switch (tone) {
    case "liquidation":
      return "#ed6d58";
    case "entry-up":
      return readCssVar("--long-text", "#38ef7d");
    case "entry-down":
      return readCssVar("--short-text", "#ef5350");
    case "entry-range":
      return readCssVar("--accent", "#d4c5b0");
    case "strike":
      return "#eab308";
    case "current":
      return "#71d886";
    case "settlement":
      return "#d4c5b0";
  }
}

export function levelLineStyle(tone: PriceLevel["tone"]): LineStyle {
  return tone === "liquidation" ? LineStyle.Dashed : LineStyle.Solid;
}

/** lightweight-charts only accepts hex/rgb — theme tokens may be oklch(). */
function resolveColorForChart(color: string, fallback: string): string {
  const trimmed = color.trim();
  if (!trimmed) return fallback;
  if (typeof document === "undefined") return fallback;

  if (/^#([0-9a-f]{3,8})$/i.test(trimmed)) return trimmed;
  if (/^rgba?\(/i.test(trimmed)) return trimmed;

  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = trimmed;
    const resolved = ctx.fillStyle;
    if (/^#([0-9a-f]{6})$/i.test(resolved) || /^rgba?\(/i.test(resolved)) {
      return resolved;
    }
  } catch {
    /* invalid color for canvas */
  }

  return fallback;
}

export function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;

  try {
    const probe = document.createElement("span");
    probe.style.display = "none";
    probe.style.color = `var(${name})`;
    document.documentElement.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return resolveColorForChart(computed, fallback);
  } catch {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return resolveColorForChart(raw, fallback);
  }
}

export function lightweightChartOptions(
  width: number,
  height: number,
  scaleMargins: { top: number; bottom: number } = { top: 0.1, bottom: 0.1 },
): DeepPartial<ChartOptions> {
  const background = readCssVar("--card", "#1f1f1f");
  const text = readCssVar("--muted-foreground", "#9a9a97");
  const grid = readCssVar("--surface", "#232323");

  return {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: background },
      textColor: text,
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: grid, visible: true },
      horzLines: { color: grid, visible: true },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: text, labelBackgroundColor: background },
      horzLine: { color: text, labelBackgroundColor: background },
    },
    rightPriceScale: {
      borderColor: grid,
      scaleMargins,
    },
    timeScale: {
      borderColor: grid,
      timeVisible: true,
      secondsVisible: false,
    },
    localization: {
      priceFormatter: (price: number) =>
        price.toLocaleString(undefined, { maximumFractionDigits: price >= 1000 ? 0 : 2 }),
    },
  };
}

export function lineSeriesAccentColor(): string {
  return readCssVar("--accent", "#d4c5b0");
}

export function lineSeriesWinColor(): string {
  return readCssVar("--long-text", "#38ef7d");
}

export function lineSeriesLossColor(): string {
  return readCssVar("--short-text", "#ef5350");
}

export function candlestickUpColor(): string {
  return readCssVar("--long-text", "#38ef7d");
}

export function candlestickDownColor(): string {
  return readCssVar("--short-text", "#ef5350");
}
