import { appConfig } from "@/lib/config";

/** DeepBook Predict instrument sides — binary UP/DOWN and vertical RANGE. */
export type PredictSide = "up" | "down" | "range";

export const PREDICT_SIDES: readonly PredictSide[] = ["up", "down", "range"] as const;

export function isRangeTradingEnabled(): boolean {
  return appConfig.rangeEnabled;
}

/** Outcome sides shown in trade / order-book toggles. */
export const TRADE_PREDICT_SIDES: readonly PredictSide[] = isRangeTradingEnabled()
  ? PREDICT_SIDES
  : (["up", "down"] as const);

export function coercePredictSide(side: PredictSide): PredictSide {
  if (side === "range" && !isRangeTradingEnabled()) return "up";
  return side;
}

export const predictSideLabel: Record<PredictSide, string> = {
  up: "UP",
  down: "DOWN",
  range: "RANGE",
};

/** Labels for the trade panel side toggle. */
export const tradePanelSideLabel: Record<"up" | "down", string> = {
  up: "LONG",
  down: "SHORT",
};

export function sideFromIsUp(isUp: boolean): "up" | "down" {
  return isUp ? "up" : "down";
}

export function predictSideFromBinary(args: {
  isUp: boolean;
  isRange?: boolean;
}): PredictSide {
  if (args.isRange) return "range";
  return sideFromIsUp(args.isUp);
}

export function isUpFromSide(side: PredictSide): boolean | undefined {
  if (side === "up") return true;
  if (side === "down") return false;
  return undefined;
}

/** CSS modifier for existing long/short toggle styles. */
export function sideToggleClass(side: PredictSide, active: boolean): string {
  if (!active) return "border border-border text-muted-foreground";
  if (side === "up") return "bg-[var(--long-bg)] font-semibold text-[var(--long-text)]";
  if (side === "down") return "bg-[var(--short-bg)] font-semibold text-[var(--short-text)]";
  return "bg-accent/20 text-accent ring-1 ring-accent/40";
}

export function formatRangeStrikes(lower: number, upper: number): string {
  return `$${lower.toLocaleString("en-US", { maximumFractionDigits: 0 })} – $${upper.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
