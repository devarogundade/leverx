import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/leverx/ConfirmDialog";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { InfoPopover } from "@/components/leverx/InfoPopover";
import { QuoteAmount, QuoteIcon } from "@/components/leverx/QuoteAmount";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig, useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { positionKeyFromArgs, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import { formatQuantity } from "@/lib/leverx/format-quantity";
import { fetchKeyQuoteBalance, fetchManagerOpenQuantity } from "@/lib/leverx/quotes";
import {
  hasIndexerOpenQuantity,
  settleContractQuantity,
  type OnChainQuantityRead,
} from "@/lib/leverx/position-quantity";
import { showTxError, showTxSuccess } from "@/lib/toast";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { assetLabelForOracleId, isOracleSettledForTrade } from "@/lib/predict/oracles";
import { centsToPremiumRaw, marginUsdToQuoteAtoms, isLimitCentsWithinPredictBounds, PREDICT_MAX_PREMIUM_CENTS, PREDICT_MIN_PREMIUM_CENTS, clampUsdToQuoteAtoms, formatMaxWithdrawUsd, usdExceedsQuoteAtoms, withdrawUsdDecimals, withdrawUsdDisplayAmount } from "@/lib/leverx/trade-math";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";
import { pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";

type ActionView = "menu" | "close_limit" | "repay_debt" | "withdraw_surplus";
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

type PositionActionAvailability = {
  canCloseRedeem: boolean;
  canSettle: boolean;
  canRepayDebt: boolean;
  canWithdrawSurplus: boolean;
  hasAnyAction: boolean;
  emptyMessage: string | null;
};

/** Which manage actions are valid for this position (on-chain qty + oracle state). */
function getPositionActionAvailability(params: {
  position: LeveragedPosition;
  onChainQuantity: OnChainQuantityRead;
  quantityLoading: boolean;
  oracleSettled: boolean;
  keyQuoteBalanceAtoms: bigint | null | undefined;
  keyBalanceLoading: boolean;
  now?: number;
}): PositionActionAvailability {
  const {
    position,
    onChainQuantity,
    quantityLoading,
    oracleSettled,
    keyQuoteBalanceAtoms,
    keyBalanceLoading,
  } = params;
  const now = params.now ?? Date.now();
  const expired = position.expiry_ms > 0 && position.expiry_ms < now;
  const hasDebt = position.borrow_quote > 0;

  const settleQty = settleContractQuantity(onChainQuantity, position);
  const hasRedeemableQuantity =
    onChainQuantity != null
      ? onChainQuantity > 0n
      : hasIndexerOpenQuantity(position);

  const canCloseRedeem = hasRedeemableQuantity && !oracleSettled;
  const canSettle = expired && oracleSettled && settleQty > 0n && !quantityLoading;
  const canRepayDebt = hasDebt;
  const canWithdrawSurplus =
    !keyBalanceLoading &&
    keyQuoteBalanceAtoms != null &&
    keyQuoteBalanceAtoms > 0n &&
    !hasDebt;

  let emptyMessage: string | null = null;
  if (
    !quantityLoading &&
    !keyBalanceLoading &&
    !canCloseRedeem &&
    !canSettle &&
    !canRepayDebt &&
    !canWithdrawSurplus
  ) {
    const indexStale =
      onChainQuantity === 0n && hasIndexerOpenQuantity(position);
    if (indexStale) {
      emptyMessage =
        "Contracts are already redeemed on-chain. The portfolio index is stale — this row should clear after refresh. No withdrawable dUSDC was found on this market key.";
    } else if (settleQty === 0n && !hasIndexerOpenQuantity(position)) {
      emptyMessage =
        "Contracts fully redeemed. Any remaining dUSDC may be in Withdraw to wallet below your positions.";
    } else if (expired && !oracleSettled && hasIndexerOpenQuantity(position)) {
      emptyMessage = "Waiting for oracle settlement before you can settle.";
    } else {
      emptyMessage = "No actions available for this position.";
    }
  }

  return {
    canCloseRedeem,
    canSettle,
    canRepayDebt,
    canWithdrawSurplus,
    hasAnyAction: canCloseRedeem || canSettle || canRepayDebt || canWithdrawSurplus,
    emptyMessage,
  };
}

function PositionDetailGrid({
  position,
  contractQuantity,
  quantityLoading,
}: {
  position: LeveragedPosition;
  contractQuantity?: OnChainQuantityRead;
  quantityLoading?: boolean;
}) {
  const indexerQty = position.open_quantity;
  const onChainQty = contractQuantity != null ? Number(contractQuantity) : null;
  const displayQty = onChainQty ?? indexerQty;
  const qtyStaleHigh =
    onChainQty != null && onChainQty > 0 && onChainQty !== indexerQty;
  const qtyStaleLow = onChainQty === 0 && indexerQty > 0;

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
      {qtyStaleHigh ? (
        <dt className="col-span-2 text-xs text-muted-foreground">
          On-chain quantity (portfolio index may be stale).
        </dt>
      ) : null}
      {qtyStaleLow ? (
        <dt className="col-span-2 text-xs text-muted-foreground">
          On-chain contracts are zero — portfolio index still lists this position.
        </dt>
      ) : null}
      <dt className="text-muted-foreground">Margin</dt>
      <dd className="text-right">
        <QuoteAmount amount={scaleQuote(position.margin_quote)} digits={2} align="end" />
      </dd>
      <dt className="text-muted-foreground">Borrowed</dt>
      <dd className="text-right">
        <QuoteAmount amount={scaleQuote(position.borrow_quote)} digits={2} align="end" />
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
    withdrawQuote,
    isProtocolReady,
  } = useLeverxTransactions();

  const positionKey = positionToKey(position);
  const marketKey = positionKeyFromArgs(positionKey);
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
        key: positionKey,
      }),
    enabled: Boolean(open && cfg && position.predict_manager_id),
    staleTime: 10_000,
    retry: 1,
  });

  const { data: keyQuoteBalanceAtoms, isLoading: keyBalanceLoading } = useQuery({
    queryKey: [
      "proxy-key-balance",
      position.account_id,
      marketKey,
      cfg?.packageId,
      cfg?.predictPackageId,
    ],
    queryFn: () =>
      fetchKeyQuoteBalance({
        client,
        leverxPackageId: cfg!.packageId,
        predictPackageId: cfg!.predictPackageId,
        accountId: position.account_id,
        key: positionKey,
      }),
    enabled: Boolean(open && cfg?.packageId && cfg?.predictPackageId && position.account_id),
    staleTime: 10_000,
    retry: 1,
  });

  const onChainQtyRead: OnChainQuantityRead =
    quantityLoading ? null : (onChainQuantity ?? null);

  const oracleRow = oracles.find((o) => o.oracle_id === position.oracle_id);
  const oracleSettled = isOracleSettledForTrade(oracleRow);

  const [view, setView] = useState<ActionView>("menu");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [limitCents, setLimitCents] = useState("");
  const [repayUsd, setRepayUsd] = useState("");
  const [withdrawUsd, setWithdrawUsd] = useState("");

  const pending =
    closePosition.isPending ||
    settleExpired.isPending ||
    repayDebt.isPending ||
    withdrawQuote.isPending;
  const { canCloseRedeem, canSettle, canRepayDebt, canWithdrawSurplus, emptyMessage } =
    getPositionActionAvailability({
      position,
      onChainQuantity: onChainQtyRead,
      quantityLoading,
      oracleSettled,
      keyQuoteBalanceAtoms,
      keyBalanceLoading,
    });
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const withdrawableAtoms = keyQuoteBalanceAtoms ?? 0n;
  const withdrawableUsd = withdrawUsdDisplayAmount(withdrawableAtoms);
  const withdrawableDigits = withdrawUsdDecimals(withdrawableAtoms);
  const repayNum = parseFloat(repayUsd) || 0;
  const repayExceedsDebt = repayNum > borrowedUsd + 1e-6;
  const limitCentsNum = parseFloat(limitCents);
  const limitCentsInvalid =
    !Number.isFinite(limitCentsNum) ||
    limitCentsNum <= 0 ||
    !isLimitCentsWithinPredictBounds(limitCentsNum);
  const repayInvalid = !Number.isFinite(repayNum) || repayNum <= 0;
  const withdrawNum = parseFloat(withdrawUsd) || 0;
  const withdrawExceedsBalance =
    withdrawableAtoms > 0n && usdExceedsQuoteAtoms(withdrawNum, withdrawableAtoms);
  const withdrawInvalid =
    withdrawableAtoms <= 0n ||
    !Number.isFinite(withdrawNum) ||
    withdrawNum <= 0 ||
    withdrawExceedsBalance;

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
        : view === "withdraw_surplus"
          ? "Withdraw to wallet"
          : "Repay debt";

  const description =
    view === "menu"
      ? "Choose how to manage this position."
      : view === "close_limit"
        ? leverxInfo.closeLimit
        : view === "withdraw_surplus"
          ? leverxInfo.withdrawTradingBalance
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
              contractQuantity={onChainQtyRead}
              quantityLoading={quantityLoading}
            />
            <div className="space-y-2">
              {canCloseRedeem ? (
                <>
                  <ActionButton
                    label="Close at market"
                    hint="Redeem now at the best available bid"
                    info={leverxInfo.closeMarket}
                    disabled={!isProtocolReady || pending}
                    onClick={() => setConfirmAction("market_close")}
                  />
                  <ActionButton
                    label="Close at limit"
                    hint="Set a minimum bid per contract"
                    info={leverxInfo.closeLimit}
                    disabled={!isProtocolReady || pending}
                    onClick={() => setView("close_limit")}
                  />
                </>
              ) : null}
              {canRepayDebt ? (
                <ActionButton
                  label="Repay debt"
                  hint={
                    <span className="inline-flex items-center gap-1">
                      <QuoteAmount amount={borrowedUsd} digits={2} /> borrowed
                    </span>
                  }
                  info={leverxInfo.repayDebt}
                  disabled={!isProtocolReady || pending}
                  onClick={() => setView("repay_debt")}
                />
              ) : null}
              {canSettle ? (
                <ActionButton
                  label="Settle expired"
                  hint="Redeem after oracle settlement"
                  info={leverxInfo.settleExpired}
                  disabled={!isProtocolReady || pending}
                  onClick={() => setConfirmAction("settle")}
                />
              ) : null}
              {canWithdrawSurplus ? (
                <ActionButton
                  label="Withdraw to wallet"
                  hint={
                    <span className="inline-flex items-center gap-1">
                      <QuoteAmount
                        amount={withdrawableUsd}
                        digits={withdrawableDigits}
                      />{" "}
                      available on this key
                    </span>
                  }
                  info={leverxInfo.withdrawTradingBalance}
                  disabled={!isProtocolReady || pending}
                  onClick={() => {
                    setWithdrawUsd(formatMaxWithdrawUsd(withdrawableAtoms));
                    setView("withdraw_surplus");
                  }}
                />
              ) : null}
              {emptyMessage ? (
                <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  {emptyMessage}
                </p>
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
              <QuoteAmount
                amount={borrowedUsd}
                digits={2}
                className="text-foreground"
                amountClassName="text-foreground"
              />
            </p>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="Repay amount"
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

        {view === "withdraw_surplus" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Available on this market key:{" "}
              <QuoteAmount
                amount={withdrawableUsd}
                digits={withdrawableDigits}
                className="text-foreground"
                amountClassName="text-foreground"
              />
            </p>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={withdrawableDigits >= 6 ? 0.000001 : withdrawableDigits >= 4 ? 0.0001 : 0.01}
              placeholder="Withdraw amount"
              value={withdrawUsd}
              onChange={(e) => setWithdrawUsd(e.target.value)}
              className="font-mono"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-sm")}
                onClick={() => setWithdrawUsd(formatMaxWithdrawUsd(withdrawableAtoms))}
              >
                Max
              </button>
            </div>
            {withdrawExceedsBalance ? (
              <p className="text-sm text-destructive">Amount exceeds available balance.</p>
            ) : null}
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
              disabled={pending || withdrawInvalid}
              onClick={() => {
                const usd = parseFloat(withdrawUsd);
                const amountAtoms = clampUsdToQuoteAtoms(usd, withdrawableAtoms);
                if (amountAtoms <= 0n) return;
                withdrawQuote.mutate(
                  {
                    accountId: position.account_id,
                    key: positionKey,
                    amountAtoms,
                  },
                  {
                    onError,
                    onSuccess: () => onSuccess("dUSDC withdrawn to wallet"),
                  },
                );
              }}
            >
              {withdrawQuote.isPending ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Confirm withdraw"
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
          contractQuantity={onChainQtyRead}
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
          contractQuantity={onChainQtyRead}
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
  hint: ReactNode;
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
  const { isProtocolReady, closePosition, settleExpired, repayDebt, withdrawQuote } =
    useLeverxTransactions();
  const pending =
    closePosition.isPending ||
    settleExpired.isPending ||
    repayDebt.isPending ||
    withdrawQuote.isPending;

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
