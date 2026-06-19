import { MARKET_TITLES } from "@/lib/leverx/indexer-markets";
import type { PredictSide } from "@/lib/predict/instruments";
import { cn } from "@/lib/utils";

type Props = {
  /** Defaults to up — catalog and trade pages always show "Bitcoin Up". */
  side?: PredictSide;
  className?: string;
};

export function MarketTitle({ side = "up", className }: Props) {
  return <span className={cn(className)}>{MARKET_TITLES[side]}</span>;
}
