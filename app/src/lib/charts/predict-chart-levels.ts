import type { PriceLevel } from "@/lib/charts/price-level";
import type { PredictSide } from "@/lib/predict/instruments";

export interface StrikeChartLevelInput {
  activeSide: PredictSide;
  strikePrice?: number;
  rangeLower?: number;
  rangeUpper?: number;
}

/** Horizontal strike guides for the live spot chart. */
export function buildStrikeChartLevels(input: StrikeChartLevelInput): PriceLevel[] {
  const { activeSide, strikePrice, rangeLower, rangeUpper } = input;

  if (activeSide === "range") {
    const levels: PriceLevel[] = [];
    if (rangeLower != null && rangeLower > 0) {
      levels.push({ label: "Lower strike", price: rangeLower, tone: "strike" });
    }
    if (rangeUpper != null && rangeUpper > 0) {
      levels.push({ label: "Upper strike", price: rangeUpper, tone: "strike" });
    }
    return levels;
  }

  if (strikePrice != null && strikePrice > 0) {
    return [{ label: "Strike", price: strikePrice, tone: "strike" }];
  }

  return [];
}
