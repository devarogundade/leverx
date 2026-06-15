import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import {
  FundsDestinationTabs,
  type FundsDestinationTab,
} from "@/components/leverx/FundsDestinationTabs";
import { QuoteAmount, QuoteAmountInline } from "@/components/leverx/QuoteAmount";
import { Input } from "@/components/ui/input";
import { useDepositKeyTargets } from "@/hooks/useDepositKeyTargets";
import { useLeverxProtocolConfig, useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
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
import { inputInField, pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import type { DepositKeyTarget } from "@/hooks/useDepositKeyTargets";

type DepositTarget =
  | { kind: "manager"; predictManagerId: string }
  | { kind: "key"; row: DepositKeyTarget };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  predictManagerId?: string | null;
  positions: readonly LeveragedPosition[];
}

function marketLabel(row: DepositKeyTarget, asset: string): string {
  const side = predictSideLabel[sideFromIsUp(row.position.is_up)];
  return row.position.is_range ? `${asset} range` : `${asset} ${side}`;
}

export function PortfolioDepositDialog({
  open,
  onOpenChange,
  accountId,
  predictManagerId,
  positions,
}: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const { cfg } = useLeverxProtocolConfig();
  const keyTargets = useDepositKeyTargets(positions);
  const { depositQuote, depositManagerQuote, isProtocolReady } = useLeverxTransactions();
  const { data: walletUsd, isLoading: walletLoading } = useWalletCoinBalance(
    open ? (cfg?.quoteType ?? null) : null,
  );

  const walletAtoms = useMemo(
    () => (walletUsd != null && walletUsd > 0 ? marginUsdToQuoteAtoms(walletUsd) : 0n),
    [walletUsd],
  );

  const managerAvailable = Boolean(predictManagerId);
  const positionsAvailable = keyTargets.length > 0;

  const [tab, setTab] = useState<FundsDestinationTab>("manager");
  const [selectedPositionIndex, setSelectedPositionIndex] = useState(0);
  const [amountUsd, setAmountUsd] = useState("");

  useEffect(() => {
    if (!open) {
      setAmountUsd("");
      setTab("manager");
      setSelectedPositionIndex(0);
      return;
    }
    if (managerAvailable) {
      setTab("manager");
    } else if (positionsAvailable) {
      setTab("positions");
    }
    if (walletAtoms > 0n) {
      setAmountUsd(formatMaxWithdrawUsd(walletAtoms));
    }
  }, [open, walletAtoms, managerAvailable, positionsAvailable]);

  useEffect(() => {
    if (selectedPositionIndex >= keyTargets.length) {
      setSelectedPositionIndex(0);
    }
  }, [selectedPositionIndex, keyTargets.length]);

  const selected = useMemo((): DepositTarget | null => {
    if (tab === "manager" && predictManagerId) {
      return { kind: "manager", predictManagerId };
    }
    if (tab === "positions") {
      const row = keyTargets[selectedPositionIndex];
      if (row) return { kind: "key", row };
    }
    return null;
  }, [tab, predictManagerId, keyTargets, selectedPositionIndex]);

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
  const hasAnyDestination = managerAvailable || positionsAvailable;

  const close = () => onOpenChange(false);

  const onConfirm = () => {
    if (!selected) return;
    const usd = parseFloat(amountUsd);
    const amountAtoms = clampUsdToQuoteAtoms(usd, walletAtoms);
    if (amountAtoms <= 0n) return;

    if (selected.kind === "manager") {
      depositManagerQuote.mutate(
        { predictManagerId: selected.predictManagerId, amountAtoms },
        {
          onSuccess: () => {
            showTxSuccess("dUSDC deposited to Predict manager");
            close();
          },
          onError: showTxError,
        },
      );
      return;
    }

    depositQuote.mutate(
      { accountId, key: selected.row.key, amountAtoms },
      {
        onSuccess: () => {
          showTxSuccess("dUSDC deposited to market key");
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
      title="Deposit to trading account"
      description={leverxInfo.depositTradingBalance}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Wallet balance
          </p>
          <p className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
            {walletLoading && walletUsd == null ? (
              "…"
            ) : (
              <QuoteAmount amount={walletUsd ?? 0} digits={2} hideZero />
            )}
          </p>
        </div>

        {walletLoading && walletUsd == null ? (
          <p className="text-sm text-muted-foreground">Loading wallet balance…</p>
        ) : !hasAnyDestination ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Open a trade or link a Predict manager before depositing.
          </p>
        ) : walletAtoms <= 0n ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No dUSDC in your wallet. Fund your wallet first, then deposit here.
          </p>
        ) : (
          <>
            <FundsDestinationTabs
              value={tab}
              onChange={(next) => {
                setTab(next);
                setSelectedPositionIndex(0);
              }}
            />

            {tab === "manager" ? (
              managerAvailable ? (
                <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    Predict manager
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Recommended
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Shared pool for minting and redeems
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Link a Predict manager in Account settings to deposit here.
                </p>
              )
            ) : positionsAvailable ? (
              <div className="space-y-1.5">
                {keyTargets.map((row, index) => {
                  const isSelected = index === selectedPositionIndex;
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
                          Market key margin ledger
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                          isSelected ? "border-accent bg-accent" : "border-muted-foreground/40",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Open a trade first to deposit to a position key.
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
                onClick={() => setAmountUsd(formatMaxWithdrawUsd(walletAtoms))}
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
              {pending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Confirm deposit"}
            </button>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
