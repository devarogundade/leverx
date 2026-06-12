import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { useProxyKeyBalances } from "@/hooks/useProxyKeyBalances";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { formatUsdcOrPlaceholder } from "@/lib/leverx/placeholders";
import { showTxError, showTxSuccess } from "@/lib/toast";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { scaleQuoteAtoms } from "@/lib/predict/scaling";
import { marginUsdToQuoteAtoms } from "@/lib/leverx/trade-math";
import {
  inputInField,
  pillToggleBtn,
  pillToggleIdle,
  settingsList,
  settingsListItem,
  settingsListItemHeader,
  tradeSurface,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import type { ProxyKeyBalanceRow } from "@/hooks/useProxyKeyBalances";

interface Props {
  accountId: string;
  positions: readonly LeveragedPosition[];
  className?: string;
}

function marketLabel(row: ProxyKeyBalanceRow, asset: string): string {
  const side = predictSideLabel[sideFromIsUp(row.position.is_up)];
  return row.position.is_range ? `${asset} range` : `${asset} ${side}`;
}

export function PortfolioWithdrawSection({ accountId, positions, className }: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const { rows, isLoading } = useProxyKeyBalances(accountId, positions);
  const { withdrawQuote, isProtocolReady } = useLeverxTransactions();

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [amountUsd, setAmountUsd] = useState("");

  const activeRow = rows.find((r) => r.position.position_key === activeKey) ?? null;
  const maxUsd = activeRow ? scaleQuoteAtoms(activeRow.balanceAtoms) : 0;
  const amountNum = parseFloat(amountUsd) || 0;
  const amountInvalid = !Number.isFinite(amountNum) || amountNum <= 0 || amountNum > maxUsd + 1e-6;

  return (
    <section className={cn(tradeSurface, "overflow-hidden", className)}>
      <div className="border-b border-border px-4 py-3">
        <LabelWithInfo
          label="Withdraw to wallet"
          labelClassName="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          info={leverxInfo.withdrawTradingBalance}
        />
      </div>
      <div className="px-4 py-3">
        {isLoading && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Loading balances…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No withdrawable dUSDC on your trading account. After closing a trade, proceeds stay on
            the market key until you withdraw here (repay any borrow first).
          </p>
        ) : (
          <ul className={settingsList}>
            {rows.map((row) => {
              const asset = assetLabelForOracleId(row.position.oracle_id, oracles);
              const balanceUsd = scaleQuoteAtoms(row.balanceAtoms);
              const isOpen = activeKey === row.position.position_key;

              return (
                <li key={row.position.position_key} className={settingsListItem}>
                  <div className={settingsListItemHeader}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{marketLabel(row, asset)}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        Available {formatUsdcOrPlaceholder(balanceUsd)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(pillToggleBtn, pillToggleIdle, "gap-1 text-xs")}
                      disabled={!isProtocolReady || withdrawQuote.isPending}
                      onClick={() => {
                        setActiveKey(row.position.position_key);
                        setAmountUsd(balanceUsd.toFixed(2));
                      }}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      Withdraw
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        value={amountUsd}
                        onChange={(e) => setAmountUsd(e.target.value)}
                        placeholder="Amount (dUSDC)"
                        className={cn(inputInField, "font-mono text-xs")}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-xs")}
                          onClick={() => setAmountUsd(balanceUsd.toFixed(2))}
                        >
                          Max
                        </button>
                        <button
                          type="button"
                          className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-xs")}
                          disabled={
                            !isProtocolReady ||
                            amountInvalid ||
                            withdrawQuote.isPending
                          }
                          onClick={() => {
                            const usd = parseFloat(amountUsd);
                            if (!Number.isFinite(usd) || usd <= 0 || usd > maxUsd + 1e-6) return;
                            withdrawQuote.mutate(
                              {
                                accountId,
                                key: row.key,
                                amountAtoms: marginUsdToQuoteAtoms(usd),
                              },
                              {
                                onSuccess: () => {
                                  showTxSuccess("dUSDC withdrawn to wallet");
                                  setActiveKey(null);
                                  setAmountUsd("");
                                },
                                onError: showTxError,
                              },
                            );
                          }}
                        >
                          {withdrawQuote.isPending ? (
                            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                          ) : (
                            "Confirm"
                          )}
                        </button>
                      </div>
                      {amountInvalid && amountUsd ? (
                        <p className="text-xs text-destructive">
                          Enter an amount up to {balanceUsd.toFixed(2)} dUSDC.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
