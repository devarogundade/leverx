import { cn } from "@/lib/utils";
import {
  marketCard,
  marketCardBody,
  marketCardHeader,
  marketCardSparklineFooter,
  marketsGrid,
  marketsRow,
  marketsTable,
  marketsTableDesktop,
  marketsTableMobileCard,
  marketsTableMobileCardHeader,
  marketsTableMobileCardStats,
  marketsTableMobileList,
  marketsTableScroll,
  marketsTableShell,
  marketsTd,
  marketsTdHideLg,
  marketsTdHideMd,
  marketsTdHideSm,
  marketsTdMarket,
  marketsTdTrade,
  marketsTh,
  marketsThHideLg,
  marketsThHideMd,
  marketsThHideSm,
  marketsThMarket,
  marketsThTrade,
  pageBlock,
  pillToggleGroup,
  segTabsClass,
  tradeLeveragePanel,
  tradeOracleNav,
  tradeStatItem,
  tradeStatRow,
  tradeSurface,
  tradeTerminal,
  tradeTerminalBody,
  tradeTerminalChart,
  tradeTerminalHeader,
  tradeTerminalHeaderMetrics,
  tradeTerminalHeaderMetricsRow,
  tradeTerminalHeaderTop,
  tradeTerminalOrderbook,
  tradeTerminalPositions,
  tradeTerminalPositionsBody,
  tradeTerminalSidebar,
  tradeTerminalTabsRow,
  tradeTerminalWorkspace,
} from "@/lib/leverx/tw";

function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("lx-skeleton", className)} />;
}

function SkeletonIcon({ className }: { className?: string }) {
  return <SkeletonBar className={cn("h-6 w-6 shrink-0 rounded-md", className)} />;
}

function SkeletonActionsRow({ plain = false }: { plain?: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-3",
        plain ? "gap-0" : "gap-1 overflow-hidden rounded-md border border-border bg-surface p-0",
      )}
    >
      <SkeletonBar className={cn("h-8", plain ? "rounded-none" : "rounded-md")} />
      <SkeletonBar
        className={cn("h-8", plain ? "rounded-none border-l border-border/50" : "rounded-md")}
      />
      <SkeletonBar
        className={cn("h-8", plain ? "rounded-none border-l border-border/50" : "rounded-md")}
      />
    </div>
  );
}

function SkeletonPremiumQuote({ band = false }: { band?: boolean }) {
  if (band) {
    return (
      <div
        className={cn(
          marketCardSparklineFooter,
          "lx-skeleton lx-skeleton--band bg-surface/40",
        )}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <SkeletonBar className="h-5 w-[3.25rem] shrink-0" />
      <SkeletonBar className="h-4 w-10" />
    </div>
  );
}

export function MarketCardSkeleton() {
  return (
    <article className={cn(marketCard, "pointer-events-none")} aria-hidden>
      <div className={marketCardBody}>
        <div className={marketCardHeader}>
          <SkeletonIcon />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-2.5 w-full" />
            <SkeletonBar className="h-2.5 w-2/3" />
            <SkeletonBar className="h-4 w-8" />
          </div>
          <SkeletonBar className="h-5 w-10 shrink-0" />
        </div>

        <SkeletonActionsRow />

        <div className="flex items-center justify-between gap-2">
          <SkeletonBar className="h-2.5 w-24" />
          <SkeletonBar className="h-2.5 w-16" />
        </div>
      </div>

      <SkeletonPremiumQuote band />
    </article>
  );
}

function MarketTableMobileCardSkeleton() {
  return (
    <article className={cn(marketsTableMobileCard, "pointer-events-none")} aria-hidden>
      <div className={marketsTableMobileCardHeader}>
        <SkeletonIcon />
        <SkeletonIcon />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBar className="h-2.5 w-full" />
          <SkeletonBar className="h-4 w-8" />
        </div>
        <SkeletonPremiumQuote />
      </div>

      <SkeletonPremiumQuote band />

      <dl className={marketsTableMobileCardStats}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <SkeletonBar className="h-2 w-12" />
            <SkeletonBar className="h-3.5 w-16" />
          </div>
        ))}
      </dl>

      <SkeletonActionsRow />
    </article>
  );
}

export function MarketGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={marketsGrid}>
      {Array.from({ length: count }, (_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function MarketTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className={marketsTableShell}>
      <div className={marketsTableMobileList}>
        {Array.from({ length: Math.min(rows, 4) }, (_, i) => (
          <MarketTableMobileCardSkeleton key={i} />
        ))}
      </div>

      <div className={cn(marketsTableScroll, marketsTableDesktop)}>
        <table className={marketsTable} aria-hidden>
          <thead>
            <tr>
              <th className={cn(marketsTh, marketsThMarket)}>
                <SkeletonBar className="h-2.5 w-14" />
              </th>
              <th className={marketsTh}>
                <SkeletonBar className="h-2.5 w-16" />
              </th>
              <th className={cn(marketsTh, marketsThHideMd)}>
                <SkeletonBar className="h-2.5 w-14" />
              </th>
              <th className={cn(marketsTh, marketsThHideLg)}>
                <SkeletonBar className="h-2.5 w-16" />
              </th>
              <th className={cn(marketsTh, marketsThHideSm)}>
                <SkeletonBar className="h-2.5 w-16" />
              </th>
              <th className={cn(marketsTh, marketsThTrade)} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className={marketsRow}>
                <td className={cn(marketsTd, marketsTdMarket)}>
                  <div className="flex items-start gap-2.5">
                    <SkeletonIcon />
                    <SkeletonIcon />
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonBar className="h-2.5 w-full max-w-xs" />
                      <SkeletonBar className="h-4 w-8" />
                    </div>
                  </div>
                </td>
                <td className={marketsTd}>
                  <SkeletonPremiumQuote />
                </td>
                <td className={cn(marketsTd, marketsTdHideMd)}>
                  <SkeletonBar className="h-3.5 w-14" />
                </td>
                <td className={cn(marketsTd, marketsTdHideLg)}>
                  <SkeletonBar className="h-3.5 w-14" />
                </td>
                <td className={cn(marketsTd, marketsTdHideSm)}>
                  <SkeletonBar className="h-3.5 w-20" />
                </td>
                <td className={cn(marketsTd, marketsTdTrade)}>
                  <SkeletonActionsRow />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SurfaceSkeleton({
  className,
  lines = 3,
  variant = "card",
}: {
  className?: string;
  lines?: number;
  /** `plain` when already inside a trade surface panel */
  variant?: "card" | "plain";
}) {
  return (
    <div
      className={cn(
        pageBlock,
        "space-y-3",
        variant === "card" ? cn(tradeSurface, "p-4 sm:p-5") : "py-2",
        className,
      )}
      aria-hidden
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-2.5 w-24" />
          <SkeletonBar className="h-2.5 w-40" />
        </div>
        <SkeletonBar className="h-2.5 w-20" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonBar className="h-2.5 w-16" />
            <SkeletonBar className="h-2.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeChartSkeleton() {
  return (
    <div className={tradeTerminalChart}>
      <div
        className={cn(
          tradeSurface,
          "lx-skeleton lx-skeleton--block h-[var(--trade-chart-h)] w-full",
        )}
      />
    </div>
  );
}

function TradeOrderBookSkeleton() {
  return (
    <div className={tradeTerminalOrderbook}>
      <div className={cn(tradeSurface, "flex h-full min-h-[280px] flex-col")}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <SkeletonBar className="h-3 w-24" />
          <div className={cn(pillToggleGroup, "w-[9.5rem]")}>
            <SkeletonBar className="h-8 flex-1 rounded-none" />
            <SkeletonBar className="h-8 flex-1 rounded-none border-l border-border/50" />
            <SkeletonBar className="h-8 flex-1 rounded-none border-l border-border/50" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <SkeletonBar className="h-3 w-12" />
              <SkeletonBar className="h-3 w-10" />
              <SkeletonBar className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TradeLeveragePanelSkeleton() {
  return (
    <div className={cn(tradeLeveragePanel, "trade-leverage-panel")}>
      <div className="border-b border-border p-3">
        <div className={segTabsClass("stretch", "outcomes")}>
          <SkeletonBar className="h-10 rounded-none" />
          <SkeletonBar className="h-10 rounded-none border-l border-border/50" />
          <SkeletonBar className="h-10 rounded-none border-l border-border/50" />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <SkeletonBar className="h-3 w-16" />
        <div className={cn(pillToggleGroup, "w-[8.5rem]")}>
          <SkeletonBar className="h-8 flex-1 rounded-none" />
          <SkeletonBar className="h-8 flex-1 rounded-none border-l border-border/50" />
        </div>
      </div>
      <div className="space-y-5 p-4">
        <div className="space-y-2">
          <SkeletonBar className="h-3 w-14" />
          <SkeletonBar className="h-12 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <SkeletonBar className="h-3 w-16" />
          <SkeletonBar className="h-2 w-full rounded-full" />
          <div className="flex justify-between gap-2">
            <SkeletonBar className="h-3 w-8" />
            <SkeletonBar className="h-3 w-8" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="h-4 w-4 rounded-sm" />
          </div>
        </div>
        <SkeletonBar className="h-20 w-full rounded-md" />
        <SkeletonBar className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}

function TradePositionsSkeleton() {
  return (
    <div className={tradeTerminalPositions}>
      <div className={tradeTerminalTabsRow}>
        <div className="flex min-w-0 flex-1 gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBar key={i} className="h-4 w-16 shrink-0" />
          ))}
        </div>
        <div className="hidden gap-1 sm:flex">
          <SkeletonBar className="h-7 w-12 rounded-md" />
          <SkeletonBar className="h-7 w-14 rounded-md" />
        </div>
      </div>
      <div className={tradeTerminalPositionsBody}>
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.6fr))] items-center gap-3"
            >
              <div className="flex items-center gap-2">
                <SkeletonIcon className="h-5 w-5" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkeletonBar className="h-2.5 w-full max-w-[10rem]" />
                  <SkeletonBar className="h-2 w-12" />
                </div>
              </div>
              <SkeletonBar className="h-3 w-full" />
              <SkeletonBar className="h-3 w-full" />
              <SkeletonBar className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mirrors `PredictTradeTerminal` layout for route pending / loading. */
export function TradeTerminalSkeleton() {
  return (
    <section className={cn(tradeTerminal, "trade-terminal pointer-events-none")} aria-hidden>
      <header className={cn(tradeTerminalHeader, "trade-terminal-header")}>
        <div className={tradeTerminalHeaderTop}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <SkeletonIcon className="h-8 w-8 sm:h-9 sm:w-9" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-full max-w-lg sm:h-5" />
              <SkeletonBar className="h-3 w-28" />
            </div>
          </div>
          <div className={tradeOracleNav}>
            <SkeletonBar className="h-7 w-7 rounded-md sm:h-8 sm:w-8" />
            <SkeletonBar className="h-7 w-7 rounded-md sm:h-8 sm:w-8" />
          </div>
        </div>

        <div className={tradeTerminalHeaderMetrics}>
          <div className={tradeTerminalHeaderMetricsRow}>
            <div className={tradeStatRow}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className={tradeStatItem}>
                  <SkeletonBar className="h-2.5 w-14" />
                  <SkeletonBar className="h-3.5 w-16 sm:w-20" />
                </div>
              ))}
            </div>
            <SkeletonBar className="hidden h-[3.25rem] min-w-[11rem] rounded-lg lg:block" />
          </div>
        </div>
      </header>

      <div className={tradeTerminalBody}>
        <div className={cn(tradeTerminalWorkspace, "trade-terminal-workspace-desktop")}>
          <TradeChartSkeleton />
          <TradeOrderBookSkeleton />
          <div className={tradeTerminalSidebar}>
            <TradeLeveragePanelSkeleton />
          </div>
          <TradePositionsSkeleton />
        </div>
      </div>
    </section>
  );
}
