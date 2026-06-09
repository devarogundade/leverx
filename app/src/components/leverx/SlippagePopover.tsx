import { Settings2 } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  LIMIT_ORDER_EXPIRY_HOURS,
  type LimitOrderExpiryHours,
} from "@/lib/leverx/constants";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { cn } from "@/lib/utils";
import { inputInField, labelCaps, pillToggleActive, pillToggleBtn, pillToggleGroup, pillToggleIdle } from "@/lib/leverx/tw";
import type { LimitExecutionMode } from "@/lib/leverx/transactions";

interface Props {
  placementSlippagePct: number;
  orderExpiresHours: LimitOrderExpiryHours;
  limitExecution: LimitExecutionMode;
  onPlacementSlippageChange: (value: number) => void;
  onOrderExpiresHoursChange: (value: LimitOrderExpiryHours) => void;
  onLimitExecutionChange: (value: LimitExecutionMode) => void;
  className?: string;
}

function formatSlippagePct(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export function SlippagePopover({
  placementSlippagePct,
  orderExpiresHours,
  limitExecution,
  onPlacementSlippageChange,
  onOrderExpiresHoursChange,
  onLimitExecutionChange,
  className,
}: Props) {
  const summary = `${formatSlippagePct(placementSlippagePct)} | ${orderExpiresHours}h`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
            className,
          )}
          aria-label={`Limit order settings, ${summary}`}
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono text-foreground">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div>
          <LabelWithInfo
            label="Limit execution"
            labelClassName={labelCaps}
            info={leverxInfo.limitExecution}
          />
          <div className={cn(pillToggleGroup, "mt-2")} role="group">
            <button
              type="button"
              className={cn(
                pillToggleBtn,
                limitExecution === "immediate" ? pillToggleActive : pillToggleIdle,
              )}
              onClick={() => onLimitExecutionChange("immediate")}
            >
              Fill now
            </button>
            <button
              type="button"
              className={cn(
                pillToggleBtn,
                limitExecution === "resting" ? pillToggleActive : pillToggleIdle,
              )}
              onClick={() => onLimitExecutionChange("resting")}
            >
              Resting
            </button>
          </div>
        </div>
        <div>
          <LabelWithInfo
            label="Slippage"
            labelClassName={labelCaps}
            info={leverxInfo.placementSlippage}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Allowed drift vs market ask when placing or filling.
          </p>
          <Input
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            value={placementSlippagePct}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              onPlacementSlippageChange(Number.isFinite(next) && next >= 0.1 ? next : 0.1);
            }}
            className={cn(inputInField, "mt-2 h-9 rounded-md border border-border px-3 font-mono")}
          />
        </div>
        <div>
          <LabelWithInfo
            label="Order expires"
            labelClassName={labelCaps}
            info={leverxInfo.orderExpires}
          />
          <div className={cn(pillToggleGroup, "mt-2 flex-wrap")} role="group">
            {LIMIT_ORDER_EXPIRY_HOURS.map((hours) => (
              <button
                key={hours}
                type="button"
                className={cn(
                  pillToggleBtn,
                  orderExpiresHours === hours ? pillToggleActive : pillToggleIdle,
                )}
                onClick={() => onOrderExpiresHoursChange(hours)}
                aria-pressed={orderExpiresHours === hours}
              >
                {hours}h
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
