import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Wallet } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import { AnimatedCount } from "@/components/ui/animated-numbers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { isActiveOpenPosition } from "@/lib/leverx/position-metrics";
import { resolvePredictManagerId } from "@/lib/leverx/account-resolution";
import { fetchManagerQuoteBalance } from "@/lib/leverx/quotes";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts, useIndexerPositions } from "@/hooks/useIndexer";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { useWalletCoinBalance } from "@/hooks/useWalletCoinBalance";
import { ui } from "@/lib/copy";
import { appConfig } from "@/lib/config";
import {
  DATA_PLACEHOLDER,
} from "@/lib/leverx/placeholders";
import { scaleQuote, scaleQuoteAtoms } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

function BalanceRow({
  label,
  value,
  info,
}: {
  label: string;
  value: ReactNode;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm text-muted-foreground">
      {info ? <LabelWithInfo label={label} info={info} /> : <span>{label}</span>}
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function BalanceBreakdown({ className }: Props) {
  const { address, client, isWalletConnected } = useWallet();
  const { cfg } = useLeverxProtocolConfig();
  const {
    data: accounts = [],
    isLoading: accountsLoading,
    isFetched: accountsFetched,
  } = useIndexerAccounts(address ?? undefined);
  const {
    data: positions = [],
    isLoading: positionsLoading,
    isFetched: positionsFetched,
  } = useIndexerPositions(address ?? undefined, { status: "open" });
  const {
    data: walletBalance,
    isLoading: walletBalanceLoading,
    isFetched: walletBalanceFetched,
  } = useWalletCoinBalance(isWalletConnected ? appConfig.quoteType : null, 6);

  const predictManagerId = useMemo(
    () => resolvePredictManagerId(accounts, positions),
    [accounts, positions],
  );
  const managerQueryEnabled = Boolean(
    isWalletConnected && predictManagerId && cfg?.packageId && cfg?.quoteType,
  );
  const {
    data: managerBalanceAtoms,
    isLoading: managerBalanceLoading,
    isFetched: managerBalanceFetched,
    isError: managerBalanceError,
  } = useQuery({
    queryKey: [
      "manager-quote-balance",
      address,
      predictManagerId,
      cfg?.packageId,
      cfg?.quoteType,
    ],
    queryFn: () =>
      fetchManagerQuoteBalance({
        client,
        packageId: cfg!.packageId,
        predictManagerId: predictManagerId!,
        quoteType: cfg!.quoteType,
      }),
    enabled: managerQueryEnabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });

  const ready =
    isWalletConnected && accountsFetched && positionsFetched && !accountsLoading && !positionsLoading;
  const walletReady = isWalletConnected && walletBalanceFetched && !walletBalanceLoading;
  const managerReady =
    !managerQueryEnabled || (managerBalanceFetched && !managerBalanceLoading);

  const activePositions = useMemo(
    () => positions.filter(isActiveOpenPosition),
    [positions],
  );

  const margin = ready
    ? activePositions.reduce((sum, p) => sum + scaleQuote(p.margin_quote), 0)
    : null;
  const borrowed = ready ? scaleQuote(accounts[0]?.borrowed_quote ?? 0) : null;
  const managerBalance =
    !managerQueryEnabled
      ? null
      : !managerReady
        ? null
        : managerBalanceAtoms == null
          ? null
          : scaleQuoteAtoms(managerBalanceAtoms);
  const positionCount = ready ? activePositions.length : null;

  const total =
    ready && walletReady && managerReady && margin != null
      ? (walletBalance ?? 0) + margin + (managerBalance ?? 0) - (borrowed ?? 0)
      : null;

  const pillLabel = !isWalletConnected ? (
    DATA_PLACEHOLDER
  ) : total == null ? (
    "…"
  ) : (
    <QuoteAmount amount={total} compact />
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("header-balance-pill", className)}
          aria-label="Trading balance breakdown"
        >
          <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 max-w-[4.5rem] truncate sm:max-w-none">{pillLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="balance-breakdown w-56 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <LabelWithInfo
            label={ui.balanceTotal}
            labelClassName="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            info={leverxInfo.balanceTotal}
          />
          <p className="balance-breakdown-total mt-1">
            <QuoteAmount
              amount={total}
              loading={isWalletConnected && (total == null)}
              hideZero={false}
              placeholder={!isWalletConnected ? "…" : DATA_PLACEHOLDER}
            />
          </p>
        </div>

        <div className="px-3 py-1">
          {!isWalletConnected ? (
            <p className="py-3 text-sm text-muted-foreground">{ui.balanceConnectHint}</p>
          ) : (
            <>
              <BalanceRow
                label={ui.balanceWallet}
                info={leverxInfo.balanceWallet}
                value={
                  <QuoteAmount
                    amount={walletReady ? walletBalance ?? 0 : null}
                    loading={isWalletConnected && !walletReady}
                    hideZero={false}
                  />
                }
              />
              {managerQueryEnabled ? (
                <BalanceRow
                  label={ui.balanceManager}
                  info={leverxInfo.balanceManager}
                  value={
                    managerBalanceError ? (
                      "…"
                    ) : (
                      <QuoteAmount
                        amount={managerBalance}
                        loading={isWalletConnected && !managerReady}
                        hideZero={false}
                      />
                    )
                  }
                />
              ) : null}
              <BalanceRow
                label="Margin"
                info={leverxInfo.balanceMargin}
                value={
                  <QuoteAmount amount={margin} loading={!ready} hideZero={false} />
                }
              />
              <BalanceRow
                label="Borrowed"
                info={leverxInfo.balanceBorrowed}
                value={
                  <QuoteAmount amount={borrowed} loading={!ready} hideZero={false} />
                }
              />
              <BalanceRow
                label="Positions"
                info={leverxInfo.balancePositions}
                value={
                  !ready ? (
                    "…"
                  ) : positionCount == null ? (
                    DATA_PLACEHOLDER
                  ) : (
                    <AnimatedCount value={positionCount} />
                  )
                }
              />
            </>
          )}
        </div>

        {isWalletConnected ? (
          <div className="border-t border-border px-3 py-2">
            <Link
              to="/portfolio"
              className="text-sm font-medium text-accent hover:underline"
            >
              View portfolio →
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
