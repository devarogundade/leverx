import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { TradeAmountInput } from "@/components/leverx/TradeFormControls";
import { QuoteAmount, QuoteAmountInline } from "@/components/leverx/QuoteAmount";
import { useProxyKeyBalances } from "@/hooks/useProxyKeyBalances";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { HintWithInfo, LabelWithInfo } from "@/components/leverx/InfoPopover";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { showTxError, showTxSuccess } from "@/lib/toast";
import { ui } from "@/lib/copy";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { scaleQuoteAtoms } from "@/lib/predict/scaling";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import {
  clampUsdInputToQuoteAtoms,
  formatMaxWithdrawUsd,
  QUOTE_INPUT_STEP,
  usdInputExceedsQuoteAtoms,
  withdrawUsdDecimals,
  withdrawUsdDisplayAmount,
} from "@/lib/leverx/trade-math";
import { pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import type { ProxyKeyBalanceRow } from "@/hooks/useProxyKeyBalances";

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
  const { withdrawQuote, isProtocolReady } = useLeverxTransactions();

  const positionsAvailable = keyRows.length > 0;
  const accountHasDebt = useMemo(
    () => borrowedQuote > 0 || positions.some((position) => position.borrow_quote > 0),
    [borrowedQuote, positions],
  );
  const withdrawableUsd = useMemo(
    () => keyRows.reduce((sum, row) => sum + scaleQuoteAtoms(row.balanceAtoms), 0),
    [keyRows],
  );

  const [selectedPositionIndex, setSelectedPositionIndex] = useState(0);
  const [amountUsd, setAmountUsd] = useState("");

  useEffect(() => {
    if (!open) {
      setAmountUsd("");
      setSelectedPositionIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedPositionIndex >= keyRows.length) {
      setSelectedPositionIndex(0);
    }
  }, [selectedPositionIndex, keyRows.length]);

  const selected = positionsAvailable ? keyRows[selectedPositionIndex] : null;

  const maxAtoms = selected?.balanceAtoms ?? 0n;
  const maxUsd = withdrawUsdDisplayAmount(maxAtoms);
  const maxDigits = withdrawUsdDecimals(maxAtoms);
  const pending = withdrawQuote.isPending;
  const amountInvalid =
    maxAtoms <= 0n || !amountUsd.trim() || usdInputExceedsQuoteAtoms(amountUsd, maxAtoms);

  useEffect(() => {
    if (selected && maxAtoms > 0n) {
      setAmountUsd(formatMaxWithdrawUsd(maxAtoms));
    } else {
      setAmountUsd("");
    }
  }, [selectedPositionIndex, maxAtoms, selected]);

  const close = () => onOpenChange(false);

  const onConfirm = () => {
    if (!selected) return;
    const amountAtoms = clampUsdInputToQuoteAtoms(amountUsd, maxAtoms);
    if (amountAtoms <= 0n) return;

    withdrawQuote.mutate(
      { accountId, key: selected.key, amountAtoms },
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
      description={leverxInfo.withdrawDialogDescription}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <LabelWithInfo
            label={ui.balanceWithdrawable}
            labelClassName="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            info={leverxInfo.balanceWithdrawableDetail}
            infoTitle={ui.balanceWithdrawable}
          />
          <p className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
            {keyBalancesLoading && !positionsAvailable ? (
              "…"
            ) : (
              <QuoteAmount amount={withdrawableUsd} digits={2} hideZero={false} />
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {leverxInfo.withdrawDialogWithdrawableHint}
          </p>
        </div>

        {accountHasDebt ? (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
            <HintWithInfo
              summary="Outstanding vault borrow reduces what you can withdraw."
              detail={leverxInfo.managerWithdrawLockedDetail}
              infoTitle="Vault borrow"
            />
          </p>
        ) : null}

        {keyBalancesLoading && !positionsAvailable ? (
          <p className="text-sm text-muted-foreground">Loading balances…</p>
        ) : !positionsAvailable ? (
          <p className="text-sm text-muted-foreground">
            <HintWithInfo
              summary={leverxInfo.withdrawEmpty}
              detail={leverxInfo.withdrawEmptyDetail}
              infoTitle="Withdraw"
            />
          </p>
        ) : (
          <>
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
                        Free surplus on this market key
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

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Amount</p>
              <TradeAmountInput
                type="number"
                inputMode="decimal"
                min={0}
                step={QUOTE_INPUT_STEP}
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="0.00"
                disabled={!selected}
              />
              <button
                type="button"
                className={cn(pillToggleBtn, pillToggleIdle, "w-full text-sm")}
                disabled={!selected || maxAtoms <= 0n}
                onClick={() => setAmountUsd(formatMaxWithdrawUsd(maxAtoms))}
              >
                Use max ({formatMaxWithdrawUsd(maxAtoms)})
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
