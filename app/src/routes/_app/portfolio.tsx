import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WalletConnectPrompt } from "@/components/WalletConnectPrompt";
import { PortfolioSummaryBar } from "@/components/leverx/PortfolioSummaryBar";
import { PortfolioWorkspace } from "@/components/leverx/PortfolioWorkspace";
import { PortfolioPageSkeleton } from "@/components/ui/market-skeleton";
import { useWallet } from "@/context/WalletContext";
import {
  useIndexerAccounts,
  useIndexerLimitOrders,
  useIndexerPositions,
} from "@/hooks/useIndexer";
import { usePositionsMarkToMarket } from "@/hooks/usePositionsMarkToMarket";
import { pageTitle } from "@/lib/brand";
import { ui } from "@/lib/copy";
import { aggregatePortfolioSummary } from "@/lib/leverx/portfolio-summary";
import { resolveTradingAccount } from "@/lib/leverx/account-resolution";
import { isActiveOpenPosition } from "@/lib/leverx/position-metrics";
import { pageSimple, pageSimpleTitle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import { loadAppShell } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

export const Route = createFileRoute("/_app/portfolio")({
  ...routePendingOptions,
  loader: ({ context }) => loadAppShell(context.queryClient),
  head: () => ({
    meta: [
      { title: pageTitle("Portfolio") },
      {
        name: "description",
        content: "Your open trades, balance, and profit and loss.",
      },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { address, isWalletConnected } = useWallet();
  const {
    data: accounts = [],
    isLoading: accountsLoading,
    isFetched: accountsFetched,
  } = useIndexerAccounts(address ?? undefined);
  const {
    data: openPositions = [],
    isLoading: openLoading,
    isFetched: openFetched,
  } = useIndexerPositions(address ?? undefined, { status: "open" });
  const {
    data: closedPositions = [],
    isLoading: closedLoading,
    isFetched: closedFetched,
  } = useIndexerPositions(address ?? undefined, { status: "closed" });
  const {
    data: limitOrders = [],
    isLoading: ordersLoading,
    isFetched: ordersFetched,
  } = useIndexerLimitOrders(address ?? undefined);

  const activeOpenPositions = useMemo(
    () => openPositions.filter(isActiveOpenPosition),
    [openPositions],
  );

  const { byPositionId, isRefreshing } = usePositionsMarkToMarket(activeOpenPositions);

  const account = useMemo(
    () =>
      resolveTradingAccount(accounts, [...openPositions, ...closedPositions], address ?? ""),
    [accounts, openPositions, closedPositions, address],
  );
  const isLoading = accountsLoading || openLoading || closedLoading || ordersLoading;
  const statsReady = accountsFetched && openFetched && closedFetched && ordersFetched && !isLoading;

  const summary = useMemo(() => {
    if (activeOpenPositions.length === 0) return null;
    return aggregatePortfolioSummary(activeOpenPositions, byPositionId);
  }, [activeOpenPositions, byPositionId]);

  return (
    <section className={cn(pageSimple, "mx-auto max-w-[var(--page-max)]")}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={pageSimpleTitle}>Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ui.portfolioHint}</p>
        </div>
        {isWalletConnected && address ? (
          <p className="font-mono text-[11px] text-muted-foreground sm:text-right">
            {address.slice(0, 8)}…{address.slice(-6)}
          </p>
        ) : null}
      </div>

      {!isWalletConnected ? (
        <WalletConnectPrompt
          title="Log in for portfolio"
          description="Log in to see your trades, orders, and account settings."
        />
      ) : isLoading && !account && activeOpenPositions.length === 0 ? (
        <PortfolioPageSkeleton />
      ) : (
        <div className="space-y-4">
          <PortfolioSummaryBar summary={summary} loading={!statsReady && activeOpenPositions.length > 0} />

          <PortfolioWorkspace
            openPositions={activeOpenPositions}
            closedPositions={closedPositions}
            limitOrders={limitOrders}
            account={account ?? null}
            owner={address!}
            loading={isLoading}
            markToMarket={byPositionId}
            isRefreshing={isRefreshing}
          />
        </div>
      )}
    </section>
  );
}
