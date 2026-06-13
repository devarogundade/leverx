import { ChevronDown, ChevronUp } from "lucide-react";
import {
  predictSideLabel,
  predictSideTextClass,
  tradePanelSideLabel,
  type PredictSide,
} from "@/lib/predict/instruments";
import { predictSideChevron } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  side: PredictSide;
  /** LONG / SHORT instead of UP / DOWN (trade panel dual toggle). */
  variant?: "outcome" | "trade";
  /** Green UP / red DOWN (for position and order lists). */
  colored?: boolean;
  className?: string;
  iconClassName?: string;
  noIcon?: boolean;
}

export function PredictSideLabel({
  side,
  variant = "outcome",
  colored = false,
  className,
  iconClassName,
  noIcon = false,
}: Props) {
  const label =
    variant === "trade" && (side === "up" || side === "down")
      ? tradePanelSideLabel[side]
      : predictSideLabel[side];

  if (side === "range") {
    return <span className={className}>{label}</span>;
  }

  const Icon = side === "up" ? ChevronUp : ChevronDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        colored && predictSideTextClass(side),
        className,
      )}
    >
      {!noIcon ? <Icon className={cn(predictSideChevron, iconClassName)} aria-hidden /> : null}
      <span>{label}</span>
    </span>
  );
}
