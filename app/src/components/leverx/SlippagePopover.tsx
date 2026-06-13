import { Settings2 } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { leverxInfo } from "@/lib/leverx/info-copy";
import {
  availableLimitOrderExpiryPresets,
  formatLimitOrderExpiryLabel,
} from "@/lib/leverx/trade-limits";
import { cn } from "@/lib/utils";
import {
  inputInField,
  labelCaps,
  pillToggleActive,
  pillToggleBtn,
  pillToggleGroup,
  pillToggleIdle,
} from "@/lib/leverx/tw";
import type { LimitExecutionMode } from "@/lib/leverx/transactions";

interface Props {
  placementSlippagePct: number;
  orderExpiresOffsetMs: number;
  limitExecution: LimitExecutionMode;
  onPlacementSlippageChange: (value: number) => void;
  onOrderExpiresOffsetMsChange: (value: number) => void;
  onLimitExecutionChange: (value: LimitExecutionMode) => void;
  /** Market expiry — filters resting duration presets. */
  marketExpiryMs?: number;
  /** When false, only immediate limit fills are offered. */
  restingAllowed?: boolean;
  className?: string;
}

function formatSlippagePct(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export function SlippagePopover({
  placementSlippagePct,
  orderExpiresOffsetMs,
  limitExecution,
  onPlacementSlippageChange,
  onOrderExpiresOffsetMsChange,
  onLimitExecutionChange,
  marketExpiryMs,
  restingAllowed = true,
  className,
}: Props) {
  const expiryPresets =
    marketExpiryMs && marketExpiryMs > 0
      ? availableLimitOrderExpiryPresets(marketExpiryMs)
      : [];
  const canRest = restingAllowed && expiryPresets.length > 0;
  const summary = canRest
    ? `${formatSlippagePct(placementSlippagePct)} | ${formatLimitOrderExpiryLabel(orderExpiresOffsetMs)}`
    : `${formatSlippagePct(placementSlippagePct)} | Fill now`;

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
                limitExecution === "resting" ? pillToggleActive : pillToggleIdle,
                !canRest && "pointer-events-none opacity-40",
              )}
              disabled={!canRest}
              onClick={() => onLimitExecutionChange("resting")}
            >
              Resting
            </button>
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
          </div>
          {!canRest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Resting orders are unavailable in the final hour or when the market closes too soon.
            </p>
          ) : null}
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
        {canRest && limitExecution === "resting" ? (
          <div>
            <LabelWithInfo
              label="Order expires"
              labelClassName={labelCaps}
              info={leverxInfo.orderExpires}
            />
            <div className={cn(pillToggleGroup, "mt-2 flex-wrap")} role="group">
              {expiryPresets.map((preset) => (
                <button
                  key={preset.ms}
                  type="button"
                  className={cn(
                    pillToggleBtn,
                    orderExpiresOffsetMs === preset.ms ? pillToggleActive : pillToggleIdle,
                  )}
                  onClick={() => onOrderExpiresOffsetMsChange(preset.ms)}
                  aria-pressed={orderExpiresOffsetMs === preset.ms}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
