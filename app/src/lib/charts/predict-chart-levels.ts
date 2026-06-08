import type { PriceLevel } from "@/lib/charts/price-level";
import type { PredictSide } from "@/lib/predict/instruments";
import { scaleSpot } from "@/lib/predict/scaling";

/** Rough spot buffer where a 2x leveraged position is underwater (chart guide). */
const LIQUIDATION_BUFFER = 0.08;

export interface PredictChartLevelInput {
  strikeRaw?: number;
  lowerStrikeRaw?: number;
  upperStrikeRaw?: number;
  spot?: number;
  activeSide?: PredictSide;
}

export function buildPredictChartLevels(input: PredictChartLevelInput): PriceLevel[] {
  const { strikeRaw, lowerStrikeRaw, upperStrikeRaw, spot = 0, activeSide = "up" } = input;
  const levels: PriceLevel[] = [];

  if (strikeRaw && strikeRaw > 0) {
    const strike = scaleSpot(strikeRaw);
    levels.push({ label: "Target", price: strike, tone: "strike" });

    const liquidation = estimateLiquidationSpot(activeSide, strike, spot);
    if (liquidation > 0) {
      levels.push({ label: "Risk line", price: liquidation, tone: "liquidation" });
    }
  }

  if (activeSide === "range") {
    if (lowerStrikeRaw && lowerStrikeRaw > 0) {
      levels.push({
        label: "Range floor",
        price: scaleSpot(lowerStrikeRaw),
        tone: "entry-range",
      });
    }
    if (upperStrikeRaw && upperStrikeRaw > 0) {
      levels.push({
        label: "Range ceiling",
        price: scaleSpot(upperStrikeRaw),
        tone: "entry-range",
      });
    }
  }

  return levels;
}

function estimateLiquidationSpot(side: PredictSide, strike: number, spot: number): number {
  const ref = spot > 0 ? spot : strike;
  if (side === "down") return ref * (1 + LIQUIDATION_BUFFER);
  if (side === "range") return ref * (1 - LIQUIDATION_BUFFER);
  return ref * (1 - LIQUIDATION_BUFFER);
}
