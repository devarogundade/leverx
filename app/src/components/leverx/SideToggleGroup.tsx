import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  predictSideLabel,
  sideToggleClass,
  tradePanelSideLabel,
  type PredictSide,
} from "@/lib/predict/instruments";
import { segTab, segTabsClass } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

const SIDES: readonly PredictSide[] = ["up", "down", "range"];

interface Props {
  value: PredictSide;
  onValueChange: (value: PredictSide) => void;
  className?: string;
  /** LONG/SHORT only (no RANGE). */
  dual?: boolean;
}

export function SideToggleGroup({ value, onValueChange, className, dual }: Props) {
  const sides = dual ? (["up", "down"] as const) : SIDES;

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as PredictSide)}
      className={cn(segTabsClass("stretch"), className)}
    >
      {sides.map((side) => (
        <ToggleGroupItem
          key={side}
          value={side}
          className={cn(
            segTab,
            "h-auto min-h-0 rounded-none border-0 bg-transparent shadow-none",
            value === side ? sideToggleClass(side, true) : "text-muted-foreground",
          )}
        >
          {dual && (side === "up" || side === "down")
            ? tradePanelSideLabel[side]
            : predictSideLabel[side]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
