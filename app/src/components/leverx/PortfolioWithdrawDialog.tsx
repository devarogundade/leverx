import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import {
  FundsDestinationTabs,
  type FundsDestinationTab,
} from "@/components/leverx/FundsDestinationTabs";
import { QuoteAmount, QuoteAmountInline } from "@/components/leverx/QuoteAmount";
import { Input } from "@/components/ui/input";
import { useProxyKeyBalances } from "@/hooks/useProxyKeyBalances";
import { useManagerQuoteBalances } from "@/hooks/useManagerQuoteBalances";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { showTxError, showTxSuccess } from "@/lib/toast";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import {
  clampUsdToQuoteAtoms,
  formatMaxWithdrawUsd,
  usdExceedsQuoteAtoms,
  withdrawUsdDecimals,
  withdrawUsdDisplayAmount,
} from "@/lib/leverx/trade-math";
import { inputInField, pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import type { ProxyKeyBalanceRow } from "@/hooks/useProxyKeyBalances";
import type { ManagerQuoteBalanceRow } from "@/hooks/useManagerQuoteBalances";

type WithdrawTarget =
  | { kind: "key"; row: ProxyKeyBalanceRow }
  | { kind: "manager"; row: ManagerQuoteBalanceRow };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  positions: readonly LeveragedPosition[];
  borrowedQuote?: number;
}

function marketLabel(row: ProxyKeyBalanceRow, asset: string): string {
  const side = predictSideLabel[sideFromIsUp(row.position.is_up)];
  return row.position.is_range ? `${asset} range` : `${asset} ${side}`;
}

export function PortfolioWithdrawDialog({
  open,
  onOpenChange,
  accountId,
  positions,
  borrowedQuote = 0,
}: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const { rows: keyRows, isLoading: keyBalancesLoading } = useProxyKeyBalances(
    open ? accountId : undefined,
    positions,
  );
  const { rows: managerRows, isLoading: managerBalancesLoading } = useManagerQuoteBalances(
    open ? accountId : undefined,
    positions,
    borrowedQuote,
  );
  const { withdrawQuote, withdrawManagerQuote, isProtocolReady } = useLeverxTransactions();

  const managerAvailable = managerRows.length > 0;
  const positionsAvailable = keyRows.length > 0;
  const hasAnyDestination = managerAvailable || positionsAvailable;

  const [tab, setTab] = useState<FundsDestinationTab>("manager");
  const [selectedManagerIndex, setSelectedManagerIndex] = useState(0);
  const [selectedPositionIndex, setSelectedPositionIndex] = useState(0);
  const [amountUsd, setAmountUsd] = useState("");

  useEffect(() => {
    if (!open) {
      setAmountUsd("");
      setTab("manager");
      setSelectedManagerIndex(0);
      setSelectedPositionIndex(0);
      return;
    }
    if (managerAvailable) {
      setTab("manager");
    } else if (positionsAvailable) {
      setTab("positions");
    }
  }, [open, managerAvailable, positionsAvailable]);

  useEffect(() => {
    if (selectedManagerIndex >= managerRows.length) {
      setSelectedManagerIndex(0);
    }
  }, [selectedManagerIndex, managerRows.length]);

  useEffect(() => {
    if (selectedPositionIndex >= keyRows.length) {
      setSelectedPositionIndex(0);
    }
  }, [selectedPositionIndex, keyRows.length]);

  const selected = useMemo((): WithdrawTarget | null => {
    if (tab === "manager") {
      const row = managerRows[selectedManagerIndex];
      if (row) return { kind: "manager", row };
      return null;
    }
    const row = keyRows[selectedPositionIndex];
    if (row) return { kind: "key", row };
    return null;
  }, [tab, managerRows, keyRows, selectedManagerIndex, selectedPositionIndex]);

  const maxAtoms = selected?.row.balanceAtoms ?? 0n;
  const maxUsd = withdrawUsdDisplayAmount(maxAtoms);
  const maxDigits = withdrawUsdDecimals(maxAtoms);
  const isLoading = keyBalancesLoading || managerBalancesLoading;
  const pending = withdrawQuote.isPending || withdrawManagerQuote.isPending;
  const amountNum = parseFloat(amountUsd) || 0;
  const amountInvalid =
    maxAtoms <= 0n ||
    !Number.isFinite(amountNum) ||
    amountNum <= 0 ||
    usdExceedsQuoteAtoms(amountNum, maxAtoms);

  useEffect(() => {
    if (selected && maxAtoms > 0n) {
      setAmountUsd(formatMaxWithdrawUsd(maxAtoms));
    } else {
      setAmountUsd("");
    }
  }, [tab, selectedManagerIndex, selectedPositionIndex, maxAtoms, selected]);

  const close = () => onOpenChange(false);

  const onConfirm = () => {
    if (!selected) return;
    const usd = parseFloat(amountUsd);
    const amountAtoms = clampUsdToQuoteAtoms(usd, maxAtoms);
    if (amountAtoms <= 0n) return;

    if (selected.kind === "manager") {
      withdrawManagerQuote.mutate(
        { predictManagerId: selected.row.predictManagerId, amountAtoms },
        {
          onSuccess: () => {
            showTxSuccess("dUSDC withdrawn to wallet");
            close();
          },
          onError: showTxError,
        },
      );
      return;
    }

    withdrawQuote.mutate(
      { accountId, key: selected.row.key, amountAtoms },
      {
        onSuccess: () => {
          showTxSuccess("dUSDC withdrawn to wallet");
          close();
        },
        onError: showTxError,
      },
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Withdraw to wallet"
      description={leverxInfo.withdrawTradingBalance}
    >
      <div className="space-y-4">
        {isLoading && !hasAnyDestination ? (
          <p className="text-sm text-muted-foreground">Loading balances…</p>
        ) : !hasAnyDestination ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No withdrawable dUSDC right now. Free quote appears on market keys after closing a
            trade, or in your Predict manager after an external redeem. Repay vault borrow first.
          </p>
        ) : (
          <>
            <FundsDestinationTabs
              value={tab}
              onChange={(next) => {
                setTab(next);
                setSelectedManagerIndex(0);
                setSelectedPositionIndex(0);
              }}
            />

            {tab === "manager" ? (
              managerAvailable ? (
                <div className="space-y-1.5">
                  {managerRows.map((row, index) => {
                    const isSelected = index === selectedManagerIndex;
                    const balanceUsd = withdrawUsdDisplayAmount(row.balanceAtoms);
                    const balanceDigits = withdrawUsdDecimals(row.balanceAtoms);

                    return (
                      <button
                        key={`manager-${row.predictManagerId}`}
                        type="button"
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          isSelected
                            ? "border-accent bg-accent/10"
                            : "border-border bg-card/50 hover:bg-hover/50",
                        )}
                        onClick={() => setSelectedManagerIndex(index)}
                      >
                        <span className="min-w-0">
                          <span className="text-sm font-medium text-foreground">
                            Predict manager
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Shared pool balance
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <QuoteAmount
                            amount={balanceUsd}
                            digits={balanceDigits}
                            hideZero
                            className="text-sm"
                          />
                          {managerRows.length > 1 ? (
                            <span
                              className={cn(
                                "h-4 w-4 rounded-full border-2",
                                isSelected
                                  ? "border-accent bg-accent"
                                  : "border-muted-foreground/40",
                              )}
                            />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {borrowedQuote > 0
                    ? "Repay vault borrow to unlock Predict manager surplus for withdrawal."
                    : "No withdrawable balance in your Predict manager."}
                </p>
              )
            ) : positionsAvailable ? (
              <div className="space-y-1.5">
                {keyRows.map((row, index) => {
                  const isSelected = index === selectedPositionIndex;
                  const balanceUsd = withdrawUsdDisplayAmount(row.balanceAtoms);
                  const balanceDigits = withdrawUsdDecimals(row.balanceAtoms);
                  const label = marketLabel(
                    row,
                    assetLabelForOracleId(row.position.oracle_id, oracles),
                  );

                  return (
                    <button
                      key={row.position.position_key}
                      type="button"
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card/50 hover:bg-hover/50",
                      )}
                      onClick={() => setSelectedPositionIndex(index)}
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Market key surplus
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <QuoteAmount
                          amount={balanceUsd}
                          digits={balanceDigits}
                          hideZero
                          className="text-sm"
                        />
                        <span
                          className={cn(
                            "h-4 w-4 rounded-full border-2",
                            isSelected ? "border-accent bg-accent" : "border-muted-foreground/40",
                          )}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No withdrawable surplus on position keys right now.
              </p>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Amount</p>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={maxDigits >= 6 ? 0.000001 : maxDigits >= 4 ? 0.0001 : 0.01}
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="0.00"
                className={cn(inputInField, "font-mono text-sm")}
                disabled={!selected}
              />
              <button
                type="button"
                className={cn(pillToggleBtn, pillToggleIdle, "w-full text-sm")}
                disabled={!selected || maxAtoms <= 0n}
                onClick={() => setAmountUsd(formatMaxWithdrawUsd(maxAtoms))}
              >
                Use max ({maxUsd.toLocaleString("en-US", { maximumFractionDigits: maxDigits })})
              </button>
              {amountInvalid && amountUsd ? (
                <p className="text-sm text-destructive">
                  Enter an amount up to{" "}
                  <QuoteAmountInline amount={maxUsd} digits={maxDigits} suffix="." />
                </p>
              ) : null}
            </div>

            <button
              type="button"
              className={cn(pillToggleBtn, pillToggleIdle, "w-full")}
              disabled={!isProtocolReady || amountInvalid || pending || !selected}
              onClick={onConfirm}
            >
              {pending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Confirm withdraw"}
            </button>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
