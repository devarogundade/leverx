import { Minus, Plus } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Slider } from "@/components/ui/slider";
import {
  LEVERAGE_MAX,
  LEVERAGE_MIN,
  LEVERAGE_STEP,
  clampLeverage,
  formatLeverage,
} from "@/lib/leverx/trade-limits";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { cn } from "@/lib/utils";
import {
  labelCaps,
  leveragePickerHeader,
  leveragePickerValue,
  pillToggleBtn,
  pillToggleIdle,
} from "@/lib/leverx/tw";

interface Props {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export function LeverageSlider({ value, onChange, className }: Props) {
  const clamped = clampLeverage(value);

  const step = (delta: number) => {
    onChange(clampLeverage(clamped + delta));
  };

  return (
    <div className={className}>
      <div className={leveragePickerHeader}>
        <LabelWithInfo
          label="Leverage"
          labelClassName={labelCaps}
          info={leverxInfo.leverage}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "flex h-7 w-7 items-center justify-center p-0")}
            aria-label="Decrease leverage"
            disabled={clamped <= LEVERAGE_MIN}
            onClick={() => step(-LEVERAGE_STEP)}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className={cn(leveragePickerValue, "min-w-[3ch] text-center")}>
            {formatLeverage(clamped)}
          </span>
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "flex h-7 w-7 items-center justify-center p-0")}
            aria-label="Increase leverage"
            disabled={clamped >= LEVERAGE_MAX}
            onClick={() => step(LEVERAGE_STEP)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Slider
        variant="leverage"
        min={LEVERAGE_MIN}
        max={LEVERAGE_MAX}
        step={LEVERAGE_STEP}
        value={[clamped]}
        onValueChange={([next]) => next != null && onChange(clampLeverage(next))}
        aria-label="Leverage multiplier"
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{formatLeverage(LEVERAGE_MIN)}</span>
        <span>{LEVERAGE_MAX}x</span>
      </div>
    </div>
  );
}
