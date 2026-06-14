import { useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Input } from "@/components/ui/input";
import { useDepositKeyTargets } from "@/hooks/useDepositKeyTargets";
import { useLeverxProtocolConfig, useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { QuoteAmount, QuoteAmountInline } from "@/components/leverx/QuoteAmount";
import { showTxError, showTxSuccess } from "@/lib/toast";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import {
  clampUsdToQuoteAtoms,
  formatMaxWithdrawUsd,
  marginUsdToQuoteAtoms,
  usdExceedsQuoteAtoms,
  withdrawUsdDecimals,
  withdrawUsdDisplayAmount,
} from "@/lib/leverx/trade-math";
import {
  inputInField,
  labelCaps,
  pillToggleBtn,
  pillToggleIdle,
  settingsList,
  settingsListItem,
  settingsListItemHeader,
  tradeSurface,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import type { DepositKeyTarget } from "@/hooks/useDepositKeyTargets";

interface Props {
  accountId: string;
  predictManagerId?: string | null;
  positions: readonly LeveragedPosition[];
  className?: string;
}

type DepositRow =
  | { kind: "key"; row: DepositKeyTarget }
  | { kind: "manager"; predictManagerId: string };

type ActiveDeposit =
  | { kind: "key"; positionKey: string }
  | { kind: "manager"; predictManagerId: string }
  | null;

function marketLabel(row: DepositKeyTarget, asset: string): string {
  const side = predictSideLabel[sideFromIsUp(row.position.is_up)];
  return row.position.is_range ? `${asset} range` : `${asset} ${side}`;
}

export function PortfolioDepositSection({
  accountId,
  predictManagerId,
  positions,
  className,
}: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const { cfg } = useLeverxProtocolConfig();
  const keyTargets = useDepositKeyTargets(positions);
  const { depositQuote, depositManagerQuote, isProtocolReady } = useLeverxTransactions();
  const { data: walletUsd, isLoading: walletLoading } = useWalletCoinBalance(cfg?.quoteType ?? null);

  const walletAtoms = useMemo(
    () => (walletUsd != null && walletUsd > 0 ? marginUsdToQuoteAtoms(walletUsd) : 0n),
    [walletUsd],
  );

  const depositRows: DepositRow[] = useMemo(() => {
    const rows: DepositRow[] = keyTargets.map((row) => ({ kind: "key", row }));
    if (predictManagerId) {
      rows.unshift({ kind: "manager", predictManagerId });
    }
    return rows;
  }, [keyTargets, predictManagerId]);

  const [activeDeposit, setActiveDeposit] = useState<ActiveDeposit>(null);
  const [amountUsd, setAmountUsd] = useState("");

  const maxAtoms = walletAtoms;
  const maxUsd = withdrawUsdDisplayAmount(maxAtoms);
  const maxDigits = withdrawUsdDecimals(maxAtoms);
  const amountNum = parseFloat(amountUsd) || 0;
  const amountInvalid =
    maxAtoms <= 0n ||
    !Number.isFinite(amountNum) ||
    amountNum <= 0 ||
    usdExceedsQuoteAtoms(amountNum, maxAtoms);
  const pending = depositQuote.isPending || depositManagerQuote.isPending;

  return (
    <section className={cn(tradeSurface, "overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <LabelWithInfo
          label="Deposit from wallet"
          labelClassName={labelCaps}
          info={leverxInfo.depositTradingBalance}
        />
        {walletUsd != null ? (
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            Wallet{" "}
            <QuoteAmount amount={walletUsd} digits={2} hideZero className="inline-flex text-sm" />
          </span>
        ) : null}
      </div>
      <div className="px-4 py-3">
        {walletLoading && walletUsd == null ? (
          <p className="text-sm text-muted-foreground">Loading wallet balance…</p>
        ) : depositRows.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Open a trade or link a Predict manager to deposit dUSDC into your trading account.
          </p>
        ) : walletAtoms <= 0n ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No dUSDC in your wallet. Fund your wallet first, then deposit here to your market key or
            Predict manager.
          </p>
        ) : (
          <ul className={settingsList}>
            {depositRows.map((entry) => {
              if (entry.kind === "manager") {
                const isOpen =
                  activeDeposit?.kind === "manager" &&
                  activeDeposit.predictManagerId === entry.predictManagerId;

                return (
                  <li key={`manager-${entry.predictManagerId}`} className={settingsListItem}>
                    <div className={settingsListItemHeader}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Predict manager</p>
                        <p className="text-[11px] text-muted-foreground">
                          Shared pool for minting and redeems
                        </p>
                      </div>
                      <button
                        type="button"
                        className={cn(pillToggleBtn, pillToggleIdle, "gap-1 text-sm")}
                        disabled={!isProtocolReady || pending}
                        onClick={() => {
                          setActiveDeposit({
                            kind: "manager",
                            predictManagerId: entry.predictManagerId,
                          });
                          setAmountUsd(formatMaxWithdrawUsd(walletAtoms));
                        }}
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Deposit
                      </button>
                    </div>

                    {isOpen ? (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={maxDigits >= 6 ? 0.000001 : maxDigits >= 4 ? 0.0001 : 0.01}
                          value={amountUsd}
                          onChange={(e) => setAmountUsd(e.target.value)}
                          placeholder="Amount"
                          className={cn(inputInField, "font-mono text-sm")}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-sm")}
                            onClick={() => setAmountUsd(formatMaxWithdrawUsd(walletAtoms))}
                          >
                            Max
                          </button>
                          <button
                            type="button"
                            className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-sm")}
                            disabled={!isProtocolReady || amountInvalid || pending}
                            onClick={() => {
                              const usd = parseFloat(amountUsd);
                              const amountAtoms = clampUsdToQuoteAtoms(usd, walletAtoms);
                              if (amountAtoms <= 0n) return;
                              depositManagerQuote.mutate(
                                {
                                  predictManagerId: entry.predictManagerId,
                                  amountAtoms,
                                },
                                {
                                  onSuccess: () => {
                                    showTxSuccess("dUSDC deposited to Predict manager");
                                    setActiveDeposit(null);
                                    setAmountUsd("");
                                  },
                                  onError: showTxError,
                                },
                              );
                            }}
                          >
                            {pending ? (
                              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                            ) : (
                              "Confirm"
                            )}
                          </button>
                        </div>
                        {amountInvalid && amountUsd ? (
                          <p className="text-sm text-destructive">
                            Enter an amount up to{" "}
                            <QuoteAmountInline amount={maxUsd} digits={maxDigits} suffix="." />
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              }

              const row = entry.row;
              const asset = assetLabelForOracleId(row.position.oracle_id, oracles);
              const isOpen =
                activeDeposit?.kind === "key" &&
                activeDeposit.positionKey === row.position.position_key;

              return (
                <li key={row.position.position_key} className={settingsListItem}>
                  <div className={settingsListItemHeader}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{marketLabel(row, asset)}</p>
                      <p className="text-[11px] text-muted-foreground">Market key margin ledger</p>
                    </div>
                    <button
                      type="button"
                      className={cn(pillToggleBtn, pillToggleIdle, "gap-1 text-sm")}
                      disabled={!isProtocolReady || pending}
                      onClick={() => {
                        setActiveDeposit({
                          kind: "key",
                          positionKey: row.position.position_key,
                        });
                        setAmountUsd(formatMaxWithdrawUsd(walletAtoms));
                      }}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      Deposit
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={maxDigits >= 6 ? 0.000001 : maxDigits >= 4 ? 0.0001 : 0.01}
                        value={amountUsd}
                        onChange={(e) => setAmountUsd(e.target.value)}
                        placeholder="Amount"
                        className={cn(inputInField, "font-mono text-sm")}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-sm")}
                          onClick={() => setAmountUsd(formatMaxWithdrawUsd(walletAtoms))}
                        >
                          Max
                        </button>
                        <button
                          type="button"
                          className={cn(pillToggleBtn, pillToggleIdle, "flex-1 text-sm")}
                          disabled={!isProtocolReady || amountInvalid || pending}
                          onClick={() => {
                            const usd = parseFloat(amountUsd);
                            const amountAtoms = clampUsdToQuoteAtoms(usd, walletAtoms);
                            if (amountAtoms <= 0n) return;
                            depositQuote.mutate(
                              {
                                accountId,
                                key: row.key,
                                amountAtoms,
                              },
                              {
                                onSuccess: () => {
                                  showTxSuccess("dUSDC deposited to market key");
                                  setActiveDeposit(null);
                                  setAmountUsd("");
                                },
                                onError: showTxError,
                              },
                            );
                          }}
                        >
                          {pending ? (
                            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                          ) : (
                            "Confirm"
                          )}
                        </button>
                      </div>
                      {amountInvalid && amountUsd ? (
                        <p className="text-sm text-destructive">
                          Enter an amount up to{" "}
                          <QuoteAmountInline amount={maxUsd} digits={maxDigits} suffix="." />
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
