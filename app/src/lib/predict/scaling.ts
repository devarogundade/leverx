import { FLOAT_SCALING, QUOTE_UNIT } from "@/lib/predict/constants";

/** On-chain spot / strike fields from predict-server (÷ 1e9). */
export function scaleSpot(value: number | null | undefined): number {
  if (value == null || value <= 0) return 0;
  return value / Number(FLOAT_SCALING);
}

/** dUSDC and other quote amounts from predict-server (÷ 1e6). */
export function scaleQuote(value: number | null | undefined): number {
  if (value == null || value <= 0) return 0;
  return value / Number(QUOTE_UNIT);
}

/** Token amounts from on-chain atom counts. */
export function scaleAtoms(value: number | null | undefined, decimals: number): number {
  if (value == null || value <= 0) return 0;
  return value / 10 ** decimals;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}
