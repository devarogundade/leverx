import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/leverx/ConfirmDialog";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { InfoPopover } from "@/components/leverx/InfoPopover";
import { QuoteAmount, QuoteIcon } from "@/components/leverx/QuoteAmount";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/context/WalletContext";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { useLeverxProtocolConfig, useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { positionKeyFromArgs, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import { formatQuantity } from "@/lib/leverx/format-quantity";
import { fetchKeyQuoteBalance, fetchManagerOpenQuantity, fetchManagerQuoteBalance } from "@/lib/leverx/quotes";
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

type ActionView = "menu" | "close_limit" | "repay_debt" | "withdraw_surplus" | "deposit_margin";
type DepositDestination = "key" | "manager";
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
  withdrawFromManager: boolean;
  canDeposit: boolean;
  depositToManager: boolean;
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
  managerQuoteBalanceAtoms: bigint | null | undefined;
  managerBalanceLoading: boolean;
  walletDepositAtoms: bigint;
  walletBalanceLoading: boolean;
  now?: number;
}): PositionActionAvailability {
  const {
    position,
    onChainQuantity,
    quantityLoading,
    oracleSettled,
    keyQuoteBalanceAtoms,
    keyBalanceLoading,
    managerQuoteBalanceAtoms,
    managerBalanceLoading,
    walletDepositAtoms,
    walletBalanceLoading,
  } = params;
  const now = params.now ?? Date.now();
  const expired = position.expiry_ms > 0 && position.expiry_ms < now;
  const hasDebt = position.borrow_quote > 0;
  const keyBalance = keyQuoteBalanceAtoms ?? 0n;
  const managerBalance = managerQuoteBalanceAtoms ?? 0n;

  const settleQty = settleContractQuantity(onChainQuantity);
  const hasRedeemableQuantity =
    onChainQuantity != null
      ? onChainQuantity > 0n
      : hasIndexerOpenQuantity(position);

  const canCloseRedeem = hasRedeemableQuantity && !oracleSettled;
  const canSettle =
    expired &&
    oracleSettled &&
    settleQty > 0n &&
    !quantityLoading &&
    onChainQuantity != null;
  const canRepayDebt = hasDebt;
  const canWithdrawKeySurplus =
    !keyBalanceLoading && keyBalance > 0n && !hasDebt;
  const canWithdrawManagerSurplus =
    !managerBalanceLoading &&
    !keyBalanceLoading &&
    managerBalance > 0n &&
    keyBalance === 0n &&
    !hasDebt &&
    onChainQuantity === 0n;
  const canWithdrawSurplus = canWithdrawKeySurplus || canWithdrawManagerSurplus;
  const withdrawFromManager = canWithdrawManagerSurplus && !canWithdrawKeySurplus;
  const canDepositKey = !walletBalanceLoading && walletDepositAtoms > 0n;
  const canDepositManager =
    canDepositKey && Boolean(position.predict_manager_id);
  const canDeposit = canDepositKey;
  const depositToManager = canDepositManager;

  let emptyMessage: string | null = null;
  if (
    !quantityLoading &&
    !keyBalanceLoading &&
    !managerBalanceLoading &&
    !walletBalanceLoading &&
    !canCloseRedeem &&
    !canSettle &&
    !canRepayDebt &&
    !canWithdrawSurplus &&
    !canDeposit
  ) {
    const indexStale =
      onChainQuantity === 0n && hasIndexerOpenQuantity(position);
    if (indexStale && expired && oracleSettled && managerBalance > 0n) {
      emptyMessage =
        "Contracts are already redeemed on-chain. Use Withdraw to wallet to move dUSDC from your Predict manager balance.";
    } else if (indexStale && expired && oracleSettled) {
      emptyMessage =
        "Contracts are already redeemed on-chain. The portfolio index is stale — this row should clear after refresh. Check Withdraw to wallet for any remaining dUSDC.";
    } else if (indexStale) {
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
    withdrawFromManager,
    canDeposit,
    depositToManager,
    hasAnyAction:
      canCloseRedeem ||
      canSettle ||
      canRepayDebt ||
      canWithdrawSurplus ||
      canDeposit,
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
    withdrawManagerQuote,
    depositQuote,
    depositManagerQuote,
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

  const { data: managerQuoteBalanceAtoms, isLoading: managerBalanceLoading } = useQuery({
    queryKey: [
      "manager-quote-balance",
      position.predict_manager_id,
      cfg?.packageId,
      cfg?.quoteType,
    ],
    queryFn: () =>
      fetchManagerQuoteBalance({
        client,
        packageId: cfg!.packageId,
        predictManagerId: position.predict_manager_id!,
        quoteType: cfg!.quoteType,
      }),
    enabled: Boolean(open && cfg?.packageId && cfg?.quoteType && position.predict_manager_id),
    staleTime: 10_000,
    retry: 1,
  });

  const { data: walletUsd, isLoading: walletBalanceLoading } = useWalletCoinBalance(
    open ? (cfg?.quoteType ?? null) : null,
  );
  const walletDepositAtoms =
    walletUsd != null && walletUsd > 0 ? marginUsdToQuoteAtoms(walletUsd) : 0n;

  const onChainQtyRead: OnChainQuantityRead =
    quantityLoading ? null : (onChainQuantity ?? null);

  const oracleRow = oracles.find((o) => o.oracle_id === position.oracle_id);
  const oracleSettled = isOracleSettledForTrade(oracleRow);

  const [view, setView] = useState<ActionView>("menu");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [limitCents, setLimitCents] = useState("");
  const [repayUsd, setRepayUsd] = useState("");
  const [withdrawUsd, setWithdrawUsd] = useState("");
  const [depositUsd, setDepositUsd] = useState("");
  const [depositDestination, setDepositDestination] = useState<DepositDestination>("key");

  const pending =
    closePosition.isPending ||
    settleExpired.isPending ||
    repayDebt.isPending ||
    withdrawQuote.isPending ||
    withdrawManagerQuote.isPending ||
    depositQuote.isPending ||
    depositManagerQuote.isPending;
  const {
    canCloseRedeem,
    canSettle,
    canRepayDebt,
    canWithdrawSurplus,
    withdrawFromManager,
    canDeposit,
    depositToManager,
    emptyMessage,
  } = getPositionActionAvailability({
    position,
    onChainQuantity: onChainQtyRead,
    quantityLoading,
    oracleSettled,
    keyQuoteBalanceAtoms,
    keyBalanceLoading,
    managerQuoteBalanceAtoms,
    managerBalanceLoading,
    walletDepositAtoms,
    walletBalanceLoading,
  });
  const borrowedUsd = scaleQuote(position.borrow_quote);
  const keyBalanceAtoms = keyQuoteBalanceAtoms ?? 0n;
  const managerBalanceAtoms = managerQuoteBalanceAtoms ?? 0n;
  const withdrawableAtoms = withdrawFromManager ? managerBalanceAtoms : keyBalanceAtoms;
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
  const depositNum = parseFloat(depositUsd) || 0;
  const depositExceedsWallet =
    walletDepositAtoms > 0n && usdExceedsQuoteAtoms(depositNum, walletDepositAtoms);
  const depositInvalid =
    walletDepositAtoms <= 0n ||
    !Number.isFinite(depositNum) ||
    depositNum <= 0 ||
    depositExceedsWallet;
  const depositableUsd = withdrawUsdDisplayAmount(walletDepositAtoms);
  const depositableDigits = withdrawUsdDecimals(walletDepositAtoms);
  const depositUsesManager = depositDestination === "manager" && depositToManager;

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
          : view === "deposit_margin"
            ? "Deposit from wallet"
          : "Repay debt";

  const description =
    view === "menu"
      ? "Choose how to manage this position."
      : view === "close_limit"
        ? leverxInfo.closeLimit
        : view === "withdraw_surplus"
          ? leverxInfo.withdrawTradingBalance
          : view === "deposit_margin"
            ? leverxInfo.depositTradingBalance
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
                      {withdrawFromManager
                        ? "in Predict manager"
                        : "available on this key"}
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
              {canDeposit ? (
                <ActionButton
                  label="Deposit from wallet"
                  hint={
                    <span className="inline-flex items-center gap-1">
                      <QuoteAmount amount={depositableUsd} digits={depositableDigits} /> in wallet
                    </span>
                  }
                  info={leverxInfo.depositTradingBalance}
                  disabled={!isProtocolReady || pending}
                  onClick={() => {
                    setDepositUsd(formatMaxWithdrawUsd(walletDepositAtoms));
                    setDepositDestination("key");
                    setView("deposit_margin");
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
              {withdrawFromManager ? "Available in Predict manager" : "Available on this market key"}
              :{" "}
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
                if (withdrawFromManager) {
                  if (!position.predict_manager_id) {
                    showTxError(new Error("Position is missing a linked Predict manager."));
                    return;
                  }
                  withdrawManagerQuote.mutate(
                    {
                      predictManagerId: position.predict_manager_id,
                      amountAtoms,
                    },
                    {
                      onError,
                      onSuccess: () => onSuccess("dUSDC withdrawn to wallet"),
                    },
                  );
                  return;
                }
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
              {withdrawQuote.isPending || withdrawManagerQuote.isPending ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Confirm withdraw"
              )}
            </button>
          </div>
        ) : null}

        {view === "deposit_margin" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Wallet balance:{" "}
              <QuoteAmount
                amount={depositableUsd}
                digits={depositableDigits}
                className="text-foreground"
                amountClassName="text-foreground"
              />
            </p>
            {depositToManager ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(
                    pillToggleBtn,
                    depositDestination === "key" ? "bg-muted text-foreground" : pillToggleIdle,
                    "flex-1 text-sm",
                  )}
                  onClick={() => setDepositDestination("key")}
                >
                  Market key
                </button>
                <button
                  type="button"
                  className={cn(
                    pillToggleBtn,
                    depositDestination === "manager" ? "bg-muted text-foreground" : pillToggleIdle,
                    "flex-1 text-sm",
                  )}
                  onClick={() => setDepositDestination("manager")}
                >
                  Predict manager
                </button>
              </div>
            ) : null}
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={depositableDigits >= 6 ? 0.000001 : depositableDigits >= 4 ? 0.0001 : 0.01}
              placeholder="Deposit amount"
              value={depositUsd}
              onChange={(e) => setDepositUsd(e.target.value)}
              className="font-mono"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-sm")}
                onClick={() => setDepositUsd(formatMaxWithdrawUsd(walletDepositAtoms))}
              >
                Max
              </button>
            </div>
            {depositExceedsWallet ? (
              <p className="text-sm text-destructive">Amount exceeds wallet balance.</p>
            ) : null}
            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
              disabled={pending || depositInvalid}
              onClick={() => {
                const usd = parseFloat(depositUsd);
                const amountAtoms = clampUsdToQuoteAtoms(usd, walletDepositAtoms);
                if (amountAtoms <= 0n) return;
                if (depositUsesManager) {
                  if (!position.predict_manager_id) {
                    showTxError(new Error("Position is missing a linked Predict manager."));
                    return;
                  }
                  depositManagerQuote.mutate(
                    {
                      predictManagerId: position.predict_manager_id,
                      amountAtoms,
                    },
                    {
                      onError,
                      onSuccess: () => onSuccess("dUSDC deposited to Predict manager"),
                    },
                  );
                  return;
                }
                depositQuote.mutate(
                  {
                    accountId: position.account_id,
                    key: positionKey,
                    amountAtoms,
                  },
                  {
                    onError,
                    onSuccess: () => onSuccess("dUSDC deposited to market key"),
                  },
                );
              }}
            >
              {depositQuote.isPending || depositManagerQuote.isPending ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Confirm deposit"
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
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-3 text-left transition-colors",
        "hover:bg-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "cursor-not-allowed opacity-50",
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
    </div>
  );
}

interface TriggerProps {
  position: LeveragedPosition;
  className?: string;
}

/** Opens position actions in a dialog (desktop) or bottom sheet (mobile). */
export function PositionActionsTrigger({ position, className }: TriggerProps) {
  const [open, setOpen] = useState(false);
  const { isProtocolReady, closePosition, settleExpired, repayDebt, withdrawQuote, withdrawManagerQuote, depositQuote, depositManagerQuote } =
    useLeverxTransactions();
  const pending =
    closePosition.isPending ||
    settleExpired.isPending ||
    repayDebt.isPending ||
    withdrawQuote.isPending ||
    withdrawManagerQuote.isPending ||
    depositQuote.isPending ||
    depositManagerQuote.isPending;

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
