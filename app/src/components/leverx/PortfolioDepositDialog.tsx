import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { CopyField } from "@/components/leverx/CopyField";
import { TradeAmountInput } from "@/components/leverx/TradeFormControls";
import { QuoteAmount, QuoteAmountInline } from "@/components/leverx/QuoteAmount";
import { useDepositKeyTargets } from "@/hooks/useDepositKeyTargets";
import { useLeverxProtocolConfig, useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import { useWalletCoinBalance, walletCoinBalanceUsd } from "@/hooks/useWalletCoinBalance";
import { useWallet } from "@/context/WalletContext";
import { isActiveOpenPosition } from "@/lib/leverx/position-metrics";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
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
import { showTxError, showTxSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { DepositKeyTarget } from "@/hooks/useDepositKeyTargets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  positions: readonly LeveragedPosition[];
}

function marketLabel(row: DepositKeyTarget, asset: string): string {
  const side = predictSideLabel[sideFromIsUp(row.position.is_up)];
  return row.position.is_range ? `${asset} range` : `${asset} ${side}`;
}

export function PortfolioDepositDialog({ open, onOpenChange, accountId, positions }: Props) {
  const { address } = useWallet();
  const { data: oracles = [] } = usePredictOracleRows();
  const { cfg } = useLeverxProtocolConfig();
  const openPositions = useMemo(() => positions.filter(isActiveOpenPosition), [positions]);
  const keyTargets = useDepositKeyTargets(openPositions);
  const { depositQuote, isProtocolReady } = useLeverxTransactions();
  const { data: walletBalance, isLoading: walletLoading } = useWalletCoinBalance(
    open ? (cfg?.quoteType ?? null) : null,
  );

  const walletAtoms = walletBalance?.atoms ?? 0n;
  const walletUsd = walletCoinBalanceUsd(walletBalance);
  const positionsAvailable = keyTargets.length > 0;

  const [selectedPositionIndex, setSelectedPositionIndex] = useState(0);
  const [amountUsd, setAmountUsd] = useState("");

  useEffect(() => {
    if (!open) {
      setAmountUsd("");
      setSelectedPositionIndex(0);
      return;
    }
    if (walletAtoms > 0n) {
      setAmountUsd(formatMaxWithdrawUsd(walletAtoms));
    }
  }, [open, walletAtoms]);

  useEffect(() => {
    if (selectedPositionIndex >= keyTargets.length) {
      setSelectedPositionIndex(0);
    }
  }, [selectedPositionIndex, keyTargets.length]);

  const selected = positionsAvailable ? keyTargets[selectedPositionIndex] : null;

  const maxAtoms = walletAtoms;
  const maxUsd = withdrawUsdDisplayAmount(maxAtoms);
  const maxDigits = withdrawUsdDecimals(maxAtoms);
  const amountInvalid =
    maxAtoms <= 0n || !amountUsd.trim() || usdInputExceedsQuoteAtoms(amountUsd, maxAtoms);
  const pending = depositQuote.isPending;

  const close = () => onOpenChange(false);

  const onConfirm = () => {
    if (!selected) return;
    const amountAtoms = clampUsdInputToQuoteAtoms(amountUsd, walletAtoms);
    if (amountAtoms <= 0n) return;

    depositQuote.mutate(
      { accountId, key: selected.key, amountAtoms },
      {
        onSuccess: () => {
          showTxSuccess("dUSDC deposited to trading account");
          close();
        },
        onError: showTxError,
      },
    );
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Deposit to trading account">
      <div className="space-y-4">
        {address ? (
          <CopyField
            label="Your wallet address"
            value={address}
            hint="Copy and send dUSDC here before depositing into your trading account."
          />
        ) : null}

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
        ) : !positionsAvailable ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Open a trade first to add margin to a position key.
          </p>
        ) : walletAtoms <= 0n ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No dUSDC in your wallet. Fund your wallet first, then deposit here.
          </p>
        ) : (
          <>
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
                onClick={() => setAmountUsd(formatMaxWithdrawUsd(walletAtoms))}
              >
                Use max ({formatMaxWithdrawUsd(walletAtoms)})
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
