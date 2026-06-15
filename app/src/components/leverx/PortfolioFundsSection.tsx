import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import { PortfolioDepositDialog } from "@/components/leverx/PortfolioDepositDialog";
import { PortfolioWithdrawDialog } from "@/components/leverx/PortfolioWithdrawDialog";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { useProxyKeyBalances } from "@/hooks/useProxyKeyBalances";
import { useManagerQuoteBalances } from "@/hooks/useManagerQuoteBalances";
import { useManagerQuoteBalance } from "@/hooks/useManagerQuoteBalance";
import { computeTotalBalanceUsd } from "@/lib/leverx/account-balance";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { isActiveOpenPosition } from "@/lib/leverx/position-metrics";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { ui } from "@/lib/copy";
import { scaleQuote, scaleQuoteAtoms } from "@/lib/predict/scaling";
import { labelCaps, tradeSurface } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  accountId: string;
  predictManagerId?: string | null;
  borrowedQuote: number;
  positions: readonly LeveragedPosition[];
  className?: string;
}

function FundsMetric({
  label,
  value,
  info,
  loading,
}: {
  label: string;
  value: ReactNode;
  info?: string;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      {info ? (
        <LabelWithInfo label={label} labelClassName={labelCaps} info={info} />
      ) : (
        <p className={labelCaps}>{label}</p>
      )}
      <p className="mt-1 truncate font-mono text-base tabular-nums text-foreground sm:text-lg">
        {loading ? "…" : value}
      </p>
    </div>
  );
}

function FundsActionButton({
  icon: Icon,
  label,
  description,
  disabled,
  onClick,
}: {
  icon: typeof ArrowDownToLine;
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3 text-left transition-colors",
        "hover:bg-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

export function PortfolioFundsSection({
  accountId,
  predictManagerId,
  borrowedQuote,
  positions,
  className,
}: Props) {
  const { cfg } = useLeverxProtocolConfig();
  const { data: walletUsd, isLoading: walletLoading } = useWalletCoinBalance(cfg?.quoteType ?? null);
  const { rows: keyRows, isLoading: keyBalancesLoading } = useProxyKeyBalances(accountId, positions);
  const { rows: managerRows, isLoading: managerBalancesLoading } = useManagerQuoteBalances(
    accountId,
    positions,
    borrowedQuote,
  );

  const managerQueryEnabled = Boolean(predictManagerId && cfg?.packageId && cfg?.quoteType);
  const { data: managerBalanceAtoms, isLoading: managerBalanceLoading } = useManagerQuoteBalance(
    managerQueryEnabled ? predictManagerId ?? undefined : undefined,
  );

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const marginUsd = useMemo(
    () =>
      positions
        .filter(isActiveOpenPosition)
        .reduce((sum, position) => sum + scaleQuote(position.margin_quote), 0),
    [positions],
  );
  const borrowedUsd = scaleQuote(borrowedQuote);
  const managerUsd =
    managerBalanceAtoms != null ? scaleQuoteAtoms(managerBalanceAtoms) : managerQueryEnabled ? null : 0;
  const walletReady = walletUsd != null && !walletLoading;
  const managerReady = !managerQueryEnabled || (managerBalanceAtoms != null && !managerBalanceLoading);

  const totalBalanceUsd =
    walletReady && managerReady
      ? computeTotalBalanceUsd({
          walletUsd: walletUsd ?? 0,
          marginUsd,
          managerUsd: managerUsd ?? 0,
          borrowedUsd,
        })
      : null;

  const withdrawableUsd = useMemo(() => {
    const keyTotal = keyRows.reduce((sum, row) => sum + scaleQuoteAtoms(row.balanceAtoms), 0);
    const managerTotal = managerRows.reduce(
      (sum, row) => sum + scaleQuoteAtoms(row.balanceAtoms),
      0,
    );
    return keyTotal + managerTotal;
  }, [keyRows, managerRows]);

  const balancesLoading = keyBalancesLoading || managerBalancesLoading;
  const hasLockedSurplus = borrowedUsd > 0 && (managerUsd ?? 0) > 0;

  return (
    <>
      <section className={cn(tradeSurface, "overflow-hidden", className)}>
        <div className="border-b border-border px-4 py-3">
          <LabelWithInfo
            label="Funds"
            labelClassName={labelCaps}
            info="Move dUSDC between your wallet and trading account balances."
          />
          <p className="mt-0.5 text-sm text-muted-foreground">
            Total balance matches the header pill. Withdraw only unlocks surplus not tied to borrow.
          </p>
        </div>

        <div className="border-b border-border px-4 py-3.5">
          <LabelWithInfo
            label={ui.balanceTotal}
            labelClassName={labelCaps}
            info={leverxInfo.balanceTotal}
          />
          <p className="mt-1 font-mono text-2xl tabular-nums text-foreground sm:text-3xl">
            {totalBalanceUsd == null ? (
              "…"
            ) : (
              <QuoteAmount amount={totalBalanceUsd} digits={2} hideZero={false} />
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 divide-y divide-border border-b border-border md:grid-cols-5 md:divide-x md:divide-y-0">
          <FundsMetric
            label={ui.balanceWallet}
            info={leverxInfo.balanceWallet}
            loading={walletLoading && walletUsd == null}
            value={<QuoteAmount amount={walletUsd ?? 0} digits={2} hideZero={false} />}
          />
          <FundsMetric
            label={ui.balanceManager}
            info={leverxInfo.balanceManager}
            loading={managerQueryEnabled && managerBalanceLoading && managerUsd == null}
            value={
              managerQueryEnabled ? (
                <QuoteAmount amount={managerUsd ?? 0} digits={2} hideZero={false} />
              ) : (
                "—"
              )
            }
          />
          <FundsMetric
            label="Margin"
            info={leverxInfo.balanceMargin}
            value={<QuoteAmount amount={marginUsd} digits={2} hideZero={false} />}
          />
          <FundsMetric
            label="Borrowed"
            info={leverxInfo.balanceBorrowed}
            value={<QuoteAmount amount={borrowedUsd} digits={2} hideZero={false} />}
          />
          <FundsMetric
            label={ui.balanceWithdrawable}
            info={leverxInfo.balanceWithdrawable}
            loading={balancesLoading && withdrawableUsd === 0}
            value={<QuoteAmount amount={withdrawableUsd} digits={2} hideZero={false} />}
          />
        </div>

        {hasLockedSurplus ? (
          <p className="border-b border-border px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Repay vault borrow to unlock Predict manager surplus for withdrawal.
          </p>
        ) : null}

        <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
          <FundsActionButton
            icon={ArrowDownToLine}
            label="Deposit"
            description="Move dUSDC from wallet to trade"
            disabled={!predictManagerId && positions.length === 0}
            onClick={() => setDepositOpen(true)}
          />
          <FundsActionButton
            icon={ArrowUpFromLine}
            label="Withdraw"
            description="Move surplus back to wallet"
            onClick={() => setWithdrawOpen(true)}
          />
        </div>
      </section>

      <PortfolioDepositDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        accountId={accountId}
        predictManagerId={predictManagerId}
        positions={positions}
      />
      <PortfolioWithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        accountId={accountId}
        positions={positions}
        borrowedQuote={borrowedQuote}
      />
    </>
  );
}
