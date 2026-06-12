import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { InfoPopover } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { centsToPremiumRaw, marginUsdToQuoteAtoms } from "@/lib/leverx/trade-math";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";
import { pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";

type ActionView = "menu" | "close_limit" | "repay_debt";

interface Props {
  position: LeveragedPosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PositionActionsModal({ position, open, onOpenChange }: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const {
    closePosition,
    settleExpired,
    repayDebt,
    isProtocolReady,
    formatTxError,
  } = useLeverxTransactions();

  const [view, setView] = useState<ActionView>("menu");
  const [limitCents, setLimitCents] = useState("");
  const [repayUsd, setRepayUsd] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const pending =
    closePosition.isPending || settleExpired.isPending || repayDebt.isPending;
  const expired = position.expiry_ms > 0 && position.expiry_ms < Date.now();
  const hasDebt = position.borrow_quote > 0;
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const repayNum = parseFloat(repayUsd) || 0;
  const repayExceedsDebt = repayNum > borrowedUsd + 1e-6;

  const reset = () => {
    setView("menu");
    setTxError(null);
  };

  const closeModal = () => {
    onOpenChange(false);
    window.setTimeout(reset, 200);
  };

  const onError = (err: unknown) => setTxError(formatTxError(err));

  const onSuccess = () => closeModal();

  const asset = assetLabelForOracleId(position.oracle_id, oracles);
  const side = predictSideLabel[sideFromIsUp(position.is_up)];

  const title =
    view === "menu"
      ? `${asset} · ${side}`
      : view === "close_limit"
        ? "Close at limit"
        : "Repay debt";

  const description =
    view === "menu"
      ? `Qty ${position.open_quantity.toLocaleString()} · margin ${scaleQuote(position.margin_quote).toFixed(2)} dUSDC`
      : view === "close_limit"
        ? leverxInfo.closeLimit
        : leverxInfo.repayDebt;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal();
        else onOpenChange(true);
      }}
      title={title}
      description={description}
    >
      {view !== "menu" ? (
        <button
          type="button"
          className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setView("menu");
            setTxError(null);
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : null}

      {view === "menu" ? (
        <div className="space-y-2">
          <ActionButton
            label="Close at market"
            hint="Redeem now at the best available bid"
            info={leverxInfo.closeMarket}
            disabled={!isProtocolReady || pending}
            onClick={() =>
              closePosition.mutate(
                { position, redeemMode: "market" },
                { onError, onSuccess },
              )
            }
            pending={closePosition.isPending}
          />
          <ActionButton
            label="Close at limit"
            hint="Set a minimum bid per contract"
            info={leverxInfo.closeLimit}
            disabled={!isProtocolReady || pending}
            onClick={() => setView("close_limit")}
          />
          {hasDebt ? (
            <ActionButton
              label="Repay debt"
              hint={`${borrowedUsd.toFixed(2)} dUSDC borrowed`}
              info={leverxInfo.repayDebt}
              disabled={!isProtocolReady || pending}
              onClick={() => setView("repay_debt")}
            />
          ) : null}
          {expired ? (
            <ActionButton
              label="Settle expired"
              hint="Redeem after oracle settlement"
              info={leverxInfo.settleExpired}
              disabled={!isProtocolReady || pending}
              onClick={() => settleExpired.mutate(position, { onError, onSuccess })}
              pending={settleExpired.isPending}
            />
          ) : null}
        </div>
      ) : null}

      {view === "close_limit" ? (
        <div className="space-y-3">
          <Input
            type="number"
            inputMode="decimal"
            min={0.1}
            step={0.1}
            placeholder="Min bid (¢)"
            value={limitCents}
            onChange={(e) => setLimitCents(e.target.value)}
            className="font-mono"
          />
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
            disabled={pending}
            onClick={() => {
              const cents = parseFloat(limitCents);
              if (!Number.isFinite(cents) || cents <= 0) return;
              closePosition.mutate(
                {
                  position,
                  redeemMode: "limit",
                  minPremiumPerUnit: centsToPremiumRaw(cents),
                },
                { onError, onSuccess },
              );
            }}
          >
            {closePosition.isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Confirm limit close"
            )}
          </button>
        </div>
      ) : null}

      {view === "repay_debt" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Outstanding borrow:{" "}
            <span className="font-mono text-foreground">{borrowedUsd.toFixed(2)} dUSDC</span>
          </p>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder="Repay amount (dUSDC)"
            value={repayUsd}
            onChange={(e) => setRepayUsd(e.target.value)}
            className="font-mono"
          />
          {repayExceedsDebt ? (
            <p className="text-xs text-destructive">Amount exceeds borrowed balance.</p>
          ) : null}
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
            disabled={pending || repayExceedsDebt}
            onClick={() => {
              const usd = parseFloat(repayUsd);
              if (!Number.isFinite(usd) || usd <= 0 || usd > borrowedUsd + 1e-6) return;
              repayDebt.mutate(
                { position, amountAtoms: marginUsdToQuoteAtoms(usd) },
                { onError, onSuccess },
              );
            }}
          >
            {repayDebt.isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Confirm repay"
            )}
          </button>
        </div>
      ) : null}

      {txError ? <p className="mt-3 text-xs text-destructive">{txError}</p> : null}
    </ResponsiveModal>
  );
}

function ActionButton({
  label,
  hint,
  info,
  disabled,
  onClick,
  pending,
}: {
  label: string;
  hint: string;
  info: string;
  disabled?: boolean;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-3 text-left transition-colors",
        "hover:bg-hover/50 disabled:opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {label}
          <InfoPopover iconClassName="h-3 w-3">{info}</InfoPopover>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      {pending ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : null}
    </button>
  );
}

interface TriggerProps {
  position: LeveragedPosition;
  className?: string;
}

/** Opens position actions in a dialog (desktop) or bottom sheet (mobile). */
export function PositionActionsTrigger({ position, className }: TriggerProps) {
  const [open, setOpen] = useState(false);
  const { isProtocolReady, closePosition, settleExpired, repayDebt } = useLeverxTransactions();
  const pending =
    closePosition.isPending || settleExpired.isPending || repayDebt.isPending;

  return (
    <>
      <button
        type="button"
        className={cn(pillToggleBtn, pillToggleIdle, "px-3 text-xs", className)}
        disabled={!isProtocolReady || pending}
        onClick={() => setOpen(true)}
      >
        {pending ? "Working…" : "Manage"}
      </button>
      <PositionActionsModal position={position} open={open} onOpenChange={setOpen} />
    </>
  );
}
