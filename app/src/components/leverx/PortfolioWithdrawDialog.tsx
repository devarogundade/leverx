import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
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
}

function marketLabel(row: ProxyKeyBalanceRow, asset: string): string {
  const side = predictSideLabel[sideFromIsUp(row.position.is_up)];
  return row.position.is_range ? `${asset} range` : `${asset} ${side}`;
}

export function PortfolioWithdrawDialog({ open, onOpenChange, accountId, positions }: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const { rows: keyRows, isLoading: keyBalancesLoading } = useProxyKeyBalances(
    open ? accountId : undefined,
    positions,
  );
  const { rows: managerRows, isLoading: managerBalancesLoading } = useManagerQuoteBalances(
    open ? accountId : undefined,
    positions,
  );
  const { withdrawQuote, withdrawManagerQuote, isProtocolReady } = useLeverxTransactions();

  const targets: WithdrawTarget[] = useMemo(
    () => [
      ...managerRows.map((row) => ({ kind: "manager" as const, row })),
      ...keyRows.map((row) => ({ kind: "key" as const, row })),
    ],
    [keyRows, managerRows],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [amountUsd, setAmountUsd] = useState("");

  const selected = targets[selectedIndex];
  const maxAtoms = selected
    ? selected.kind === "manager"
      ? selected.row.balanceAtoms
      : selected.row.balanceAtoms
    : 0n;
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
    if (!open) {
      setAmountUsd("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (selected && maxAtoms > 0n) {
      setAmountUsd(formatMaxWithdrawUsd(maxAtoms));
    }
  }, [selectedIndex, maxAtoms, selected]);

  useEffect(() => {
    if (selectedIndex >= targets.length) {
      setSelectedIndex(0);
    }
  }, [selectedIndex, targets.length]);

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
        {isLoading && targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading balances…</p>
        ) : targets.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No withdrawable dUSDC right now. Free quote appears on market keys after closing a
            trade, or in your Predict manager after an external redeem. Repay vault borrow first.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Withdraw from</p>
              <div className="space-y-1.5">
                {targets.map((target, index) => {
                  const isSelected = index === selectedIndex;
                  const balanceAtoms =
                    target.kind === "manager"
                      ? target.row.balanceAtoms
                      : target.row.balanceAtoms;
                  const balanceUsd = withdrawUsdDisplayAmount(balanceAtoms);
                  const balanceDigits = withdrawUsdDecimals(balanceAtoms);
                  const label =
                    target.kind === "manager"
                      ? "Predict manager"
                      : marketLabel(
                          target.row,
                          assetLabelForOracleId(target.row.position.oracle_id, oracles),
                        );
                  const sub =
                    target.kind === "manager" ? "Shared pool balance" : "Market key surplus";

                  return (
                    <button
                      key={
                        target.kind === "manager"
                          ? `manager-${target.row.predictManagerId}`
                          : target.row.position.position_key
                      }
                      type="button"
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card/50 hover:bg-hover/50",
                      )}
                      onClick={() => setSelectedIndex(index)}
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
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
            </div>

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
