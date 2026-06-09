import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoPopover } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { centsToPremiumRaw, marginUsdToQuoteAtoms } from "@/lib/leverx/trade-math";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";
import { inputInField, pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";

interface Props {
  position: LeveragedPosition;
  owner?: string;
  className?: string;
}

export function PositionRiskMenu({ position, owner, className }: Props) {
  const {
    closePosition,
    settleExpired,
    repayDebt,
    isProtocolReady,
    formatTxError,
  } = useLeverxTransactions();

  const [limitCents, setLimitCents] = useState("");
  const [repayUsd, setRepayUsd] = useState("");
  const pending =
    closePosition.isPending || settleExpired.isPending || repayDebt.isPending;
  const expired = position.expiry_ms > 0 && position.expiry_ms < Date.now();
  const hasDebt = position.borrow_quote > 0;
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const repayNum = parseFloat(repayUsd) || 0;
  const repayExceedsDebt = repayNum > borrowedUsd + 1e-6;

  const onError = (err: unknown) => window.alert(formatTxError(err));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(pillToggleBtn, pillToggleIdle, "px-2", className)}
          disabled={!isProtocolReady || pending}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() =>
            closePosition.mutate({ position, redeemMode: "market" }, { onError })
          }
        >
          <span className="flex w-full items-center justify-between gap-2">
            Close market
            <InfoPopover iconClassName="h-3 w-3" side="left">
              {leverxInfo.closeMarket}
            </InfoPopover>
          </span>
        </DropdownMenuItem>
        <Popover>
          <PopoverTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              Close limit…
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent className="w-56 space-y-2" align="end">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Close limit
              <InfoPopover side="left">{leverxInfo.closeLimit}</InfoPopover>
            </p>
            <Input
              type="number"
              inputMode="decimal"
              min={0.1}
              step={0.1}
              placeholder="Min bid (¢)"
              value={limitCents}
              onChange={(e) => setLimitCents(e.target.value)}
              className={cn(inputInField, "h-9 rounded-md border border-border px-3 font-mono text-sm")}
            />
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
              onClick={() => {
                const cents = parseFloat(limitCents);
                if (!Number.isFinite(cents) || cents <= 0) return;
                closePosition.mutate(
                  {
                    position,
                    redeemMode: "limit",
                    minPremiumPerUnit: centsToPremiumRaw(cents),
                  },
                  { onError },
                );
              }}
            >
              Confirm limit close
            </button>
          </PopoverContent>
        </Popover>
        {hasDebt ? (
          <Popover>
            <PopoverTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                Repay debt…
              </DropdownMenuItem>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-2" align="end">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                Repay debt
                <InfoPopover side="left">{leverxInfo.repayDebt}</InfoPopover>
              </p>
              <p className="text-xs text-muted-foreground">
                Borrowed {borrowedUsd.toFixed(2)} USDC
              </p>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder="Repay USDC"
                value={repayUsd}
                onChange={(e) => setRepayUsd(e.target.value)}
                className={cn(inputInField, "h-9 rounded-md border border-border px-3 font-mono text-sm")}
              />
              {repayExceedsDebt ? (
                <p className="text-xs text-destructive">Amount exceeds borrowed balance.</p>
              ) : null}
              <button
                type="button"
                className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
                disabled={repayExceedsDebt}
                onClick={() => {
                  const usd = parseFloat(repayUsd);
                  if (!Number.isFinite(usd) || usd <= 0 || usd > borrowedUsd + 1e-6) return;
                  repayDebt.mutate(
                    { position, amountAtoms: marginUsdToQuoteAtoms(usd) },
                    { onError },
                  );
                }}
              >
                Repay
              </button>
            </PopoverContent>
          </Popover>
        ) : null}
        {expired ? (
          <DropdownMenuItem
            onClick={() => settleExpired.mutate(position, { onError })}
          >
            <span className="flex w-full items-center justify-between gap-2">
              Settle expired
              <InfoPopover iconClassName="h-3 w-3" side="left">
                {leverxInfo.settleExpired}
              </InfoPopover>
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
