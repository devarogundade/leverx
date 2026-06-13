import { FLOAT_SCALING } from "@/lib/predict/constants";
import { atmStrikeRaw } from "@/lib/leverx/predict-oracle-markets";
import { strikeUsdToRaw } from "@/lib/leverx/trade-math";

const SCALE = Number(FLOAT_SCALING);

/** Normalize oracle min_strike / tick_size to raw 1e9 units. */
export function toOracleStrikeRaw(value: number | undefined | null): number {
  if (value == null || value <= 0) return 0;
  return value < 1_000_000 ? Math.round(value * SCALE) : Math.round(value);
}

export function oracleStrikeBounds(args: {
  minStrike?: number | null;
  tickSize?: number | null;
}): { minStrikeRaw: number; tickSizeRaw: number } {
  const minStrikeRaw = toOracleStrikeRaw(args.minStrike);
  const tickSizeRaw = toOracleStrikeRaw(args.tickSize) || minStrikeRaw || SCALE;
  return { minStrikeRaw, tickSizeRaw };
}

export const STRIKE_PRESET_OFFSETS = {
  pct_neg_10: -10,
  pct_neg_5: -5,
  market: 0,
  pct_pos_5: 5,
  pct_pos_10: 10,
} as const;

export type StrikePresetId = keyof typeof STRIKE_PRESET_OFFSETS | "custom";

export const STRIKE_PRESET_OPTIONS: readonly {
  id: StrikePresetId;
  label: string;
}[] = [
  { id: "pct_neg_10", label: "−10%" },
  { id: "pct_neg_5", label: "−5%" },
  { id: "market", label: "Market" },
  { id: "pct_pos_5", label: "+5%" },
  { id: "pct_pos_10", label: "+10%" },
  { id: "custom", label: "Custom" },
];

/** Snap USD strike to oracle tick grid and enforce min_strike. */
export function snapStrikeRaw(
  strikeUsd: number,
  minStrikeRaw: number,
  tickSizeRaw: number,
): number {
  if (!Number.isFinite(strikeUsd) || strikeUsd <= 0) return 0;
  const strikeRaw = strikeUsdToRaw(strikeUsd);
  const tick = tickSizeRaw > 0 ? tickSizeRaw : minStrikeRaw;
  if (tick <= 0) return Math.max(minStrikeRaw, strikeRaw);
  const snapped = Math.round(strikeRaw / tick) * tick;
  return Math.max(minStrikeRaw, snapped);
}

export function strikeRawFromPreset(
  preset: Exclude<StrikePresetId, "custom">,
  spotUsd: number,
  minStrikeRaw: number,
  tickSizeRaw: number,
): number {
  if (preset === "market" || spotUsd <= 0) {
    return atmStrikeRaw(spotUsd, minStrikeRaw, tickSizeRaw);
  }
  const offset = STRIKE_PRESET_OFFSETS[preset];
  const targetUsd = spotUsd * (1 + offset / 100);
  return snapStrikeRaw(targetUsd, minStrikeRaw, tickSizeRaw);
}

export function formatStrikeUsdFromRaw(strikeRaw: number): string {
  if (strikeRaw <= 0) return "—";
  return `$${(strikeRaw / SCALE).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function strikeUsdFromRaw(strikeRaw: number): number {
  if (strikeRaw <= 0) return 0;
  return strikeRaw / SCALE;
}

export const RANGE_PRESET_WIDTHS = {
  market: null,
  pct_2: 0.02,
  pct_5: 0.05,
  pct_10: 0.1,
} as const;

export type RangePresetId = keyof typeof RANGE_PRESET_WIDTHS | "custom";

export const RANGE_PRESET_OPTIONS: readonly {
  id: RangePresetId;
  label: string;
}[] = [
  { id: "market", label: "Market" },
  { id: "pct_2", label: "±2%" },
  { id: "pct_5", label: "±5%" },
  { id: "pct_10", label: "±10%" },
  { id: "custom", label: "Custom" },
];

/** Default oracle band: ATM − 1 tick through ATM + 1 tick. */
export function defaultRangeBoundsRaw(
  spotUsd: number,
  minStrikeRaw: number,
  tickSizeRaw: number,
): { lower: number; upper: number } {
  const atm = atmStrikeRaw(spotUsd, minStrikeRaw, tickSizeRaw);
  const tick = tickSizeRaw > 0 ? tickSizeRaw : minStrikeRaw || SCALE;
  const lower = Math.max(minStrikeRaw > 0 ? minStrikeRaw : tick, atm - tick);
  const upper = atm + tick;
  return { lower, upper };
}

export function rangeBoundsFromPreset(
  preset: Exclude<RangePresetId, "custom">,
  spotUsd: number,
  minStrikeRaw: number,
  tickSizeRaw: number,
): { lower: number; upper: number } {
  if (preset === "market" || spotUsd <= 0) {
    return defaultRangeBoundsRaw(spotUsd, minStrikeRaw, tickSizeRaw);
  }
  const width = RANGE_PRESET_WIDTHS[preset];
  const lower = snapStrikeRaw(spotUsd * (1 - width), minStrikeRaw, tickSizeRaw);
  const upper = snapStrikeRaw(spotUsd * (1 + width), minStrikeRaw, tickSizeRaw);
  if (upper <= lower) {
    return defaultRangeBoundsRaw(spotUsd, minStrikeRaw, tickSizeRaw);
  }
  return { lower, upper };
}

export function formatRangeBoundsFromRaw(lowerRaw: number, upperRaw: number): string {
  if (lowerRaw <= 0 || upperRaw <= lowerRaw) return "—";
  return `${formatStrikeUsdFromRaw(lowerRaw)} – ${formatStrikeUsdFromRaw(upperRaw)}`;
}

export function rangeWidthPct(
  lowerRaw: number,
  upperRaw: number,
  spotUsd?: number | null,
): number | null {
  if (lowerRaw <= 0 || upperRaw <= lowerRaw || spotUsd == null || spotUsd <= 0) {
    return null;
  }
  const widthUsd = (upperRaw - lowerRaw) / SCALE;
  return (widthUsd / spotUsd) * 100;
}
