import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AssetBadge } from "@/components/AssetBadge";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { PredictSideLabel } from "@/components/leverx/PredictSideLabel";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { ui } from "@/lib/copy";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { DATA_PLACEHOLDER } from "@/lib/leverx/placeholders";
import { TRADE_PREDICT_SIDES } from "@/lib/predict/instruments";
import { cn } from "@/lib/utils";
import {
  labelCaps,
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
  orderbookSideHeader,
  pageBlock,
  pillToggleActive,
  pillToggleBtn,
  pillToggleGroup,
  pillToggleIdle,
  segTabActive,
  segTabOutcome,
  segTabsClass,
  textFilterActive,
  textFilterBtn,
  textFilterGroup,
  tradeLeveragePanel,
  tradeOracleNav,
  tradeOracleNavBtn,
  tradeOracleNavBtnDisabled,
  tradeStatItem,
  tradeStatItemLabel,
  tradeStatItemValue,
  tradeStatRow,
  tradeSurface,
  tradeTerminal,
  tradeTerminalBack,
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

const TRADE_POSITION_TABS = ["Positions", "Open Orders", "Market trades", "Summary"] as const;

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
              <th className={cn(marketsTh, marketsThMarket)}>Market</th>
              <th className={marketsTh}>Index price</th>
              <th className={cn(marketsTh, marketsThHideMd)}>Volume</th>
              <th className={cn(marketsTh, marketsThHideLg)}>Liquidity</th>
              <th className={cn(marketsTh, marketsThHideSm)}>Auto close</th>
              <th className={cn(marketsTh, marketsThTrade)} aria-label="Trade actions" />
            </tr>
          </thead>
          <tbody aria-hidden>
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
  hideHeader = false,
}: {
  className?: string;
  lines?: number;
  /** `plain` when already inside a trade surface panel */
  variant?: "card" | "plain";
  /** Skip the top shimmer row when the parent already renders a real header. */
  hideHeader?: boolean;
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
      {hideHeader ? null : (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBar className="h-2.5 w-24" />
            <SkeletonBar className="h-2.5 w-40" />
          </div>
          <SkeletonBar className="h-2.5 w-20" />
        </div>
      )}
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

function TradeStatItem({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: string;
}) {
  return (
    <div className={tradeStatItem}>
      {info ? (
        <LabelWithInfo label={label} labelClassName={tradeStatItemLabel} info={info} />
      ) : (
        <span className={tradeStatItemLabel}>{label}</span>
      )}
      <span className={tradeStatItemValue}>{value}</span>
    </div>
  );
}

function TradeTerminalHeaderShell({ oracleId }: { oracleId?: string }) {
  const asset = oracleId?.slice(2, 6).toUpperCase() ?? "—";

  return (
    <header className={cn(tradeTerminalHeader, "trade-terminal-header")}>
      <div className={tradeTerminalHeaderTop}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <AssetBadge asset={asset} size="md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="lx-skeleton h-4 w-full max-w-lg sm:h-5" aria-hidden />
            <Link to="/markets" className={tradeTerminalBack}>
              {ui.backToMarkets}
            </Link>
          </div>
        </div>
        <div className={tradeOracleNav} aria-label="Market navigation">
          <span className={cn(tradeOracleNavBtn, tradeOracleNavBtnDisabled)} aria-hidden>
            <ChevronLeft className="h-4 w-4" />
          </span>
          <span className={cn(tradeOracleNavBtn, tradeOracleNavBtnDisabled)} aria-hidden>
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className={tradeTerminalHeaderMetrics}>
        <div className={tradeTerminalHeaderMetricsRow}>
          <div className={tradeStatRow}>
            <TradeStatItem
              label={ui.markPrice}
              info={leverxInfo.markPrice}
              value={DATA_PLACEHOLDER}
            />
            <TradeStatItem
              label="Contract price"
              info={leverxInfo.premium}
              value={DATA_PLACEHOLDER}
            />
            <TradeStatItem
              label="Volume (24h)"
              info={leverxInfo.volume24h}
              value={DATA_PLACEHOLDER}
            />
            <TradeStatItem label="Pool size" info={leverxInfo.vaultNav} value={DATA_PLACEHOLDER} />
            <TradeStatItem
              label="Closes"
              info={leverxInfo.autoClose}
              value={DATA_PLACEHOLDER}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function TradeOrderBookSkeleton() {
  return (
    <div className={tradeTerminalOrderbook}>
      <div className={cn(tradeSurface, "flex h-full min-h-[280px] flex-col pointer-events-none")}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <LabelWithInfo
            label="Order book"
            labelClassName={labelCaps}
            info={leverxInfo.orderBook}
          />
          <div className={pillToggleGroup} role="group" aria-label="Outcome">
            {TRADE_PREDICT_SIDES.map((option, index) => (
              <span
                key={option}
                className={cn(
                  pillToggleBtn,
                  index === 0 ? pillToggleActive : pillToggleIdle,
                )}
              >
                <PredictSideLabel side={option} noIcon />
              </span>
            ))}
          </div>
        </div>

        <div className={cn(orderbookSideHeader, "border-b border-border px-3 py-1.5")}>
          <span>Price</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Notional</span>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3" aria-hidden>
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
    <div className={cn(tradeLeveragePanel, "trade-leverage-panel pointer-events-none")}>
      <div className="border-b border-border p-3">
        <div className={segTabsClass("stretch", "outcomes")} role="group" aria-label="Outcome">
          {TRADE_PREDICT_SIDES.map((outcome, index) => (
            <span
              key={outcome}
              className={cn(segTabOutcome, index === 0 && segTabActive)}
            >
              <PredictSideLabel side={outcome} />
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <LabelWithInfo
          label="Order type"
          labelClassName={labelCaps}
          info={leverxInfo.orderType}
        />
        <div className={pillToggleGroup} role="group" aria-label="Order type">
          <span className={cn(pillToggleBtn, pillToggleActive)}>market</span>
          <span className={cn(pillToggleBtn, pillToggleIdle)}>limit</span>
        </div>
      </div>
      <div className="space-y-5 p-4" aria-hidden>
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

function tradePositionTabLabel(tab: (typeof TRADE_POSITION_TABS)[number]) {
  if (tab === "Market trades") {
    return (
      <>
        <span className="sm:hidden">Trades (…)</span>
        <span className="hidden sm:inline">Market trades (…)</span>
      </>
    );
  }
  if (tab === "Open Orders") {
    return (
      <>
        <span className="sm:hidden">Orders</span>
        <span className="hidden sm:inline">Open Orders</span>
      </>
    );
  }
  if (tab === "Positions") {
    return (
      <>
        <span className="max-[380px]:hidden">Positions</span>
        <span className="hidden max-[380px]:inline">Pos</span>
      </>
    );
  }
  if (tab === "Summary") {
    return (
      <>
        <span className="max-[380px]:hidden">Summary</span>
        <span className="hidden max-[380px]:inline">Stats</span>
      </>
    );
  }
  return tab;
}

function TradePositionsSkeleton() {
  return (
    <div className={tradeTerminalPositions}>
      <div className={tradeTerminalTabsRow}>
        <UnderlineTabs
          variant="plain"
          className="min-w-0 flex-1 pointer-events-none"
          value="Positions"
          onValueChange={() => {}}
          options={TRADE_POSITION_TABS.map((tab) => ({
            value: tab,
            label: tradePositionTabLabel(tab),
          }))}
        />
        <div className={cn(textFilterGroup, "hidden sm:flex pointer-events-none")} role="group" aria-label="Position filter">
          <span className={cn(textFilterBtn, textFilterActive)}>Open</span>
          <span className={textFilterBtn}>Closed</span>
        </div>
      </div>
      <div className={tradeTerminalPositionsBody} aria-hidden>
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
export function TradeTerminalSkeleton({ oracleId }: { oracleId?: string } = {}) {
  return (
    <section className={cn(tradeTerminal, "trade-terminal")}>
      <TradeTerminalHeaderShell oracleId={oracleId} />

      <div className={cn(tradeTerminalBody, "pointer-events-none")} aria-hidden>
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
