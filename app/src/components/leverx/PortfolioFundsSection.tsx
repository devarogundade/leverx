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
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { scaleQuote, scaleQuoteAtoms } from "@/lib/predict/scaling";
import { labelCaps, pillToggleBtn, pillToggleIdle, tradeSurface } from "@/lib/leverx/tw";
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
    <div className="min-w-0 px-4 py-3.5">
      {info ? (
        <LabelWithInfo label={label} labelClassName={labelCaps} info={info} />
      ) : (
        <p className={labelCaps}>{label}</p>
      )}
      <p className="mt-1 truncate font-mono text-lg tabular-nums text-foreground sm:text-xl">
        {loading ? "…" : value}
      </p>
    </div>
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
  );

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const tradingBalanceUsd = useMemo(() => {
    const keyTotal = keyRows.reduce((sum, row) => sum + scaleQuoteAtoms(row.balanceAtoms), 0);
    const managerTotal = managerRows.reduce(
      (sum, row) => sum + scaleQuoteAtoms(row.balanceAtoms),
      0,
    );
    return keyTotal + managerTotal;
  }, [keyRows, managerRows]);

  const balancesLoading = keyBalancesLoading || managerBalancesLoading;
  const sourceCount = keyRows.length + managerRows.length;
  const canDeposit = walletUsd != null && walletUsd > 0;
  const canWithdraw = tradingBalanceUsd > 0;

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
            Deposit from wallet to trade, or withdraw surplus back to your wallet.
          </p>
        </div>

        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <FundsMetric
            label="Wallet"
            info={leverxInfo.balanceWallet}
            loading={walletLoading && walletUsd == null}
            value={<QuoteAmount amount={walletUsd ?? 0} digits={2} hideZero />}
          />
          <FundsMetric
            label="Trading balance"
            info={leverxInfo.withdrawTradingBalance}
            loading={balancesLoading && sourceCount === 0 && tradingBalanceUsd === 0}
            value={<QuoteAmount amount={tradingBalanceUsd} digits={2} hideZero />}
          />
          <FundsMetric
            label="Vault borrow"
            info={leverxInfo.borrowedQuote}
            value={<QuoteAmount amount={scaleQuote(borrowedQuote)} hideZero />}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row">
          <button
            type="button"
            className={cn(
              pillToggleBtn,
              pillToggleIdle,
              "flex-1 gap-2 py-2.5 text-sm font-medium",
            )}
            disabled={!predictManagerId && positions.length === 0}
            onClick={() => setDepositOpen(true)}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Deposit
            {canDeposit ? (
              <span className="text-muted-foreground">
                · <QuoteAmount amount={walletUsd ?? 0} digits={2} hideZero className="inline-flex text-sm" />
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={cn(
              pillToggleBtn,
              pillToggleIdle,
              "flex-1 gap-2 py-2.5 text-sm font-medium",
            )}
            onClick={() => setWithdrawOpen(true)}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Withdraw
            {canWithdraw ? (
              <span className="text-muted-foreground">
                ·{" "}
                <QuoteAmount
                  amount={tradingBalanceUsd}
                  digits={2}
                  hideZero
                  className="inline-flex text-sm"
                />
              </span>
            ) : null}
          </button>
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
      />
    </>
  );
}
