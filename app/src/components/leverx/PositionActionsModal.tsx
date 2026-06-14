import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/leverx/ConfirmDialog";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { InfoPopover } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig, useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { positionKeyFromArgs, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import { formatQuantity } from "@/lib/leverx/format-quantity";
import { fetchManagerOpenQuantity } from "@/lib/leverx/quotes";
import { showTxError, showTxSuccess } from "@/lib/toast";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { assetLabelForOracleId, isOracleSettledForTrade } from "@/lib/predict/oracles";
import { centsToPremiumRaw, marginUsdToQuoteAtoms, isLimitCentsWithinPredictBounds, PREDICT_MAX_PREMIUM_CENTS, PREDICT_MIN_PREMIUM_CENTS } from "@/lib/leverx/trade-math";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";
import { pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";

type ActionView = "menu" | "close_limit" | "repay_debt";
type ConfirmAction = "market_close" | "settle" | null;

interface Props {
  position: LeveragedPosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function positionToKey(position: LeveragedPosition): MarketKeyArgs {
  return {
    oracleId: position.oracle_id,
    expiryMs: position.expiry_ms,
    strike: position.strike,
    higherStrike: position.higher_strike,
    isUp: position.is_up,
    isRange: position.is_range,
  };
}

function PositionDetailGrid({
  position,
  contractQuantity,
  quantityLoading,
}: {
  position: LeveragedPosition;
  contractQuantity?: bigint | null;
  quantityLoading?: boolean;
}) {
  const indexerQty = position.open_quantity;
  const onChainQty = contractQuantity != null ? Number(contractQuantity) : null;
  const displayQty = onChainQty ?? indexerQty;
  const qtyStale =
    onChainQty != null && onChainQty > 0 && onChainQty !== indexerQty;

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Quantity</dt>
      <dd
        className="text-right font-mono tabular-nums"
        title={displayQty >= 1_000 ? displayQty.toLocaleString("en-US") : undefined}
      >
        {quantityLoading ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
        ) : (
          formatQuantity(displayQty)
        )}
      </dd>
      {qtyStale ? (
        <>
          <dt className="col-span-2 text-xs text-muted-foreground">
            On-chain quantity (portfolio index may be stale).
          </dt>
        </>
      ) : null}
      <dt className="text-muted-foreground">Margin</dt>
      <dd className="text-right font-mono tabular-nums">
        {scaleQuote(position.margin_quote).toFixed(2)} dUSDC
      </dd>
      <dt className="text-muted-foreground">Borrowed</dt>
      <dd className="text-right font-mono tabular-nums">
        {scaleQuote(position.borrow_quote).toFixed(2)} dUSDC
      </dd>
      <dt className="text-muted-foreground">Leverage</dt>
      <dd className="text-right font-mono tabular-nums">
        {(position.leverage_bps / 10_000).toFixed(1)}×
      </dd>
    </dl>
  );
}

export function PositionActionsModal({ position, open, onOpenChange }: Props) {
  const { client } = useWallet();
  const { cfg } = useLeverxProtocolConfig();
  const { data: oracles = [] } = usePredictOracleRows();
  const {
    closePosition,
    settleExpired,
    repayDebt,
    isProtocolReady,
  } = useLeverxTransactions();

  const marketKey = positionKeyFromArgs(positionToKey(position));
  const { data: onChainQuantity, isLoading: quantityLoading } = useQuery({
    queryKey: [
      "manager-open-qty",
      position.predict_manager_id,
      marketKey,
      cfg?.packageId,
      cfg?.predictPackageId,
    ],
    queryFn: () =>
      fetchManagerOpenQuantity({
        client,
        packageId: cfg!.packageId,
        predictPackageId: cfg!.predictPackageId,
        predictManagerId: position.predict_manager_id!,
        key: positionToKey(position),
      }),
    enabled: Boolean(open && cfg && position.predict_manager_id),
    staleTime: 10_000,
    retry: 1,
  });

  const oracleRow = oracles.find((o) => o.oracle_id === position.oracle_id);
  const oracleSettled = isOracleSettledForTrade(oracleRow);

  const [view, setView] = useState<ActionView>("menu");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [limitCents, setLimitCents] = useState("");
  const [repayUsd, setRepayUsd] = useState("");

  const pending =
    closePosition.isPending || settleExpired.isPending || repayDebt.isPending;
  const expired = position.expiry_ms > 0 && position.expiry_ms < Date.now();
  const hasDebt = position.borrow_quote > 0;
  const hasOnChainQuantity = onChainQuantity != null && onChainQuantity > 0n;
  const hasOpenQuantity =
    hasOnChainQuantity || (onChainQuantity == null && position.open_quantity > 0);
  const canSettle = expired && oracleSettled && hasOnChainQuantity;
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const repayNum = parseFloat(repayUsd) || 0;
  const repayExceedsDebt = repayNum > borrowedUsd + 1e-6;
  const limitCentsNum = parseFloat(limitCents);
  const limitCentsInvalid =
    !Number.isFinite(limitCentsNum) ||
    limitCentsNum <= 0 ||
    !isLimitCentsWithinPredictBounds(limitCentsNum);
  const repayInvalid = !Number.isFinite(repayNum) || repayNum <= 0;

  const reset = () => {
    setView("menu");
    setConfirmAction(null);
  };

  const closeModal = () => {
    onOpenChange(false);
    window.setTimeout(reset, 200);
  };

  const onError = showTxError;
  const onSuccess = (message: string) => {
    showTxSuccess(message);
    closeModal();
  };

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
      ? "Choose how to manage this position."
      : view === "close_limit"
        ? leverxInfo.closeLimit
        : leverxInfo.repayDebt;

  return (
    <>
      <ResponsiveModal
        open={open && confirmAction == null}
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
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setView("menu")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : null}

        {view === "menu" ? (
          <div className="space-y-3">
            <PositionDetailGrid
              position={position}
              contractQuantity={onChainQuantity}
              quantityLoading={quantityLoading}
            />
            <div className="space-y-2">
              <ActionButton
                label="Close at market"
                hint="Redeem now at the best available bid"
                info={leverxInfo.closeMarket}
                disabled={!isProtocolReady || pending || !hasOpenQuantity}
                onClick={() => setConfirmAction("market_close")}
              />
              <ActionButton
                label="Close at limit"
                hint="Set a minimum bid per contract"
                info={leverxInfo.closeLimit}
                disabled={!isProtocolReady || pending || !hasOpenQuantity}
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
                  hint={
                    oracleSettled
                      ? hasOnChainQuantity
                        ? "Redeem after oracle settlement"
                        : "No contracts left on-chain — refresh portfolio"
                      : "Waiting for oracle settlement"
                  }
                  info={leverxInfo.settleExpired}
                  disabled={!isProtocolReady || pending || !canSettle || quantityLoading}
                  onClick={() => setConfirmAction("settle")}
                />
              ) : null}
            </div>
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
            {limitCentsInvalid && limitCents ? (
              <p className="text-sm text-destructive">
                Min bid must be between {PREDICT_MIN_PREMIUM_CENTS}¢ and {PREDICT_MAX_PREMIUM_CENTS}¢.
              </p>
            ) : null}
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
              disabled={pending || limitCentsInvalid}
              onClick={() => {
                const cents = parseFloat(limitCents);
                if (!Number.isFinite(cents) || cents <= 0 || !isLimitCentsWithinPredictBounds(cents)) {
                  return;
                }
                closePosition.mutate(
                  {
                    position,
                    redeemMode: "limit",
                    minPremiumPerUnit: centsToPremiumRaw(cents),
                  },
                  {
                    onError,
                    onSuccess: () => onSuccess("Position closed at limit"),
                  },
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
            <p className="text-sm text-muted-foreground">
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
              <p className="text-sm text-destructive">Amount exceeds borrowed balance.</p>
            ) : null}
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
              disabled={pending || repayExceedsDebt || repayInvalid}
              onClick={() => {
                const usd = parseFloat(repayUsd);
                if (!Number.isFinite(usd) || usd <= 0 || usd > borrowedUsd + 1e-6) return;
                repayDebt.mutate(
                  { position, amountAtoms: marginUsdToQuoteAtoms(usd) },
                  {
                    onError,
                    onSuccess: () => onSuccess("Debt repaid"),
                  },
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

      </ResponsiveModal>

      <ConfirmDialog
        open={confirmAction === "market_close"}
        onOpenChange={(next) => {
          if (!next) setConfirmAction(null);
        }}
        title={`Close ${asset} ${side} at market?`}
        description="Your position will be redeemed at the best available bid. This cannot be undone."
        confirmLabel="Close position"
        variant="destructive"
        pending={closePosition.isPending}
        onConfirm={() =>
          closePosition.mutate(
            { position, redeemMode: "market" },
            {
              onError: (err) => {
                showTxError(err);
                setConfirmAction(null);
              },
              onSuccess: () => onSuccess("Position closed at market"),
            },
          )
        }
      >
        <PositionDetailGrid
          position={position}
          contractQuantity={onChainQuantity}
          quantityLoading={quantityLoading}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmAction === "settle"}
        onOpenChange={(next) => {
          if (!next) setConfirmAction(null);
        }}
        title={`Settle expired ${asset} ${side}?`}
        description={
          oracleSettled
            ? "Finalize redemption after oracle settlement."
            : "Oracle has not settled yet — settlement is not available."
        }
        confirmLabel="Settle position"
        variant="destructive"
        pending={settleExpired.isPending}
        onConfirm={() =>
          settleExpired.mutate(position, {
            onError: (err) => {
              showTxError(err);
              setConfirmAction(null);
            },
            onSuccess: () => onSuccess("Expired position settled"),
          })
        }
      >
        <PositionDetailGrid
          position={position}
          contractQuantity={onChainQuantity}
          quantityLoading={quantityLoading}
        />
      </ConfirmDialog>
    </>
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
        <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
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
        className={cn(
          pillToggleBtn,
          pillToggleIdle,
          "px-3 text-sm font-medium",
          className,
        )}
        disabled={!isProtocolReady || pending}
        onClick={() => setOpen(true)}
      >
        {pending ? "Working…" : "Manage"}
      </button>
      <PositionActionsModal position={position} open={open} onOpenChange={setOpen} />
    </>
  );
}
