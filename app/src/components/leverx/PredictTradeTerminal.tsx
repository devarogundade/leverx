import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { PredictLeveragePanel } from "@/components/leverx/PredictLeveragePanel";
import { LeverxLimitOrdersTable } from "@/components/leverx/LeverxLimitOrdersTable";
import { LeverxPositionsTable } from "@/components/leverx/LeverxPositionsTable";
import { MarketTradesTable } from "@/components/leverx/MarketTradesTable";
import { usePositionsMarkToMarket } from "@/hooks/usePositionsMarkToMarket";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { PriceChart } from "@/components/PriceChart";
import { PredictOrderBook } from "@/components/leverx/PredictOrderBook";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { AssetBadge } from "@/components/AssetBadge";
import { useWallet } from "@/context/WalletContext";
import {
  useIndexerGlobalTrades,
  useIndexerLimitOrders,
  useIndexerPositions,
  useIndexerProtocol,
  useIndexerVaultSummary,
  useMarketCatalog,
} from "@/hooks/useIndexer";
import { useChartPriceSeries } from "@/hooks/useChartPriceSeries";
import { useOraclePriceLatest } from "@/hooks/useOracleSpotPriceSeries";
import { useOracleNeighbors, usePredictOracleRows } from "@/hooks/usePredictOracles";
import { usePredictOracleState } from "@/hooks/usePredictOracleState";
import {
  buildQuestion,
  catalogToMarketRows,
  formatPremiumOrPlaceholder,
} from "@/lib/leverx/indexer-markets";
import {
  atmStrikeRaw,
  enrichMarketRow,
  resolveRangeBounds,
  resolveTradeMarket,
} from "@/lib/leverx/predict-oracle-markets";
import { baseFromUnderlying } from "@/lib/markets";
import { formatPrice } from "@/lib/copy";
import {
  DATA_PLACEHOLDER,
  formatCountOrPlaceholder,
  formatUsdcOrPlaceholder,
} from "@/lib/leverx/placeholders";
import { summarizeGlobalTrades } from "@/lib/leverx/trade-stats";
import { formatCount, ui } from "@/lib/copy";
import { formatRangeStrikes, type PredictSide } from "@/lib/predict/instruments";
import { isOracleSettledForTrade } from "@/lib/predict/oracles";
import { scaleQuote, scaleSpot } from "@/lib/predict/scaling";
import {
  textFilterActive,
  textFilterBtn,
  textFilterGroup,
  tradeStatItem,
  tradeStatItemLabel,
  tradeStatItemValue,
  tradeSummaryGrid,
  tradeTerminal,
  tradeTerminalBack,
  tradeTerminalBody,
  tradeTerminalHeader,
  tradeTerminalHeaderMetrics,
  tradeTerminalHeaderTop,
  tradeTerminalChart,
  tradeTerminalOrderbook,
  tradeTerminalPositions,
  tradeTerminalPositionsBody,
  tradeTerminalSidebar,
  tradeTerminalTabsRow,
  tradeTerminalTitle,
  tradeOracleNav,
  tradeOracleNavBtn,
  tradeOracleNavBtnDisabled,
  tradeTerminalWorkspace,
  tradeStatRow,
  tradeMobileDock,
  tradeMobileDockTab,
  tradeMobileDockTabActive,
  tradeMobileDockTabs,
  tradeTerminalMobileBody,
  tradeTerminalMobileChartPanel,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

const TABS = ["Positions", "Open Orders", "Market trades", "Summary"] as const;
const MOBILE_WORKSPACE_TABS = ["trade", "chart"] as const;
type MobileWorkspaceTab = (typeof MOBILE_WORKSPACE_TABS)[number];

function tradeTabLabel(
  tab: (typeof TABS)[number],
  tradesLoading: boolean,
  tradeCount: string,
) {
  if (tab === "Market trades") {
    const count = tradesLoading ? "…" : tradeCount;
    return (
      <>
        <span className="sm:hidden">Trades ({count})</span>
        <span className="hidden sm:inline">Market trades ({count})</span>
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
  return tab;
}

function StatItem({
  label,
  value,
  info,
  tone,
}: {
  label: string;
  value: string;
  info?: string;
  tone?: "success" | "destructive";
}) {
  return (
    <div className={tradeStatItem}>
      {info ? (
        <LabelWithInfo
          label={label}
          labelClassName={tradeStatItemLabel}
          info={info}
        />
      ) : (
        <span className={tradeStatItemLabel}>{label}</span>
      )}
      <span
        className={cn(
          tradeStatItemValue,
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatAutoClose(expiry: number): string {
  return new Date(expiry)
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: true,
    })
    .replace(" AM", "am")
    .replace(" PM", "pm");
}

function TerminalPriceChart({
  asset,
  oracleId,
  chartStrikePrice,
  activeSide,
  chartRangeLower,
  chartRangeUpper,
  layoutActive = true,
  chartSeries,
}: {
  asset: string;
  oracleId: string;
  chartStrikePrice?: number;
  activeSide: PredictSide;
  chartRangeLower?: number;
  chartRangeUpper?: number;
  layoutActive?: boolean;
  chartSeries: ReturnType<typeof useChartPriceSeries>;
}) {
  return (
    <div className={tradeTerminalChart}>
      <PriceChart
        asset={asset}
        oracleId={oracleId}
        chartSeries={chartSeries}
        strikePrice={chartStrikePrice}
        activeSide={activeSide}
        rangeLower={chartRangeLower}
        rangeUpper={chartRangeUpper}
        layoutActive={layoutActive}
      />
    </div>
  );
}

function TerminalOrderBook({
  oracleId,
  market,
  activeSide,
  onSideChange,
  compact = false,
}: {
  oracleId: string;
  market: ReturnType<typeof resolveTradeMarket> | undefined;
  activeSide: PredictSide;
  onSideChange: (side: PredictSide) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(tradeTerminalOrderbook, compact ? "min-h-0" : "min-h-[280px]")}>
      <PredictOrderBook
        oracleId={oracleId}
        expiryMs={market?.expiry ?? 0}
        strike={market?.strikeRaw ?? 0}
        higherStrike={market?.higherStrikeRaw ?? 0}
        side={activeSide}
        onSideChange={onSideChange}
        placeholder={!market || market.strikeRaw <= 0 || !market.expiry}
        compact={compact}
      />
    </div>
  );
}

type TradePositionsPanelProps = {
  activeTab: (typeof TABS)[number];
  setActiveTab: (tab: (typeof TABS)[number]) => void;
  tradesLoading: boolean;
  tradeStats: ReturnType<typeof summarizeGlobalTrades>;
  trades: Awaited<ReturnType<typeof useIndexerGlobalTrades>>["data"];
  positionsFilter: "open" | "closed";
  setPositionsFilter: (filter: "open" | "closed") => void;
  address: string | null;
  positionsLoading: boolean;
  positions: Awaited<ReturnType<typeof useIndexerPositions>>["data"];
  ordersLoading: boolean;
  limitOrders: Awaited<ReturnType<typeof useIndexerLimitOrders>>["data"];
  vaultSummary: Awaited<ReturnType<typeof useIndexerVaultSummary>>["data"];
};

function TradePositionsPanel({
  activeTab,
  setActiveTab,
  tradesLoading,
  tradeStats,
  trades = [],
  positionsFilter,
  setPositionsFilter,
  address,
  positionsLoading,
  positions = [],
  ordersLoading,
  limitOrders = [],
  vaultSummary,
}: TradePositionsPanelProps) {
  const { byPositionId, isRefreshing } = usePositionsMarkToMarket(positions);

  return (
    <div className={tradeTerminalPositions}>
      <div className={tradeTerminalTabsRow}>
        <UnderlineTabs
          variant="plain"
          className="min-w-0 flex-1"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as (typeof TABS)[number])}
          options={TABS.map((tab) => ({
            value: tab,
            label: tradeTabLabel(tab, tradesLoading, formatCount(tradeStats.total)),
          }))}
        />
        {activeTab === "Positions" ? (
          <div className={textFilterGroup} role="group" aria-label="Position filter">
            <button
              type="button"
              className={cn(textFilterBtn, positionsFilter === "open" && textFilterActive)}
              onClick={() => setPositionsFilter("open")}
              aria-pressed={positionsFilter === "open"}
            >
              Open
            </button>
            <button
              type="button"
              className={cn(textFilterBtn, positionsFilter === "closed" && textFilterActive)}
              onClick={() => setPositionsFilter("closed")}
              aria-pressed={positionsFilter === "closed"}
            >
              Closed
            </button>
          </div>
        ) : null}
      </div>

      <div className={tradeTerminalPositionsBody}>
        {activeTab === "Summary" ? (
          <div className={tradeSummaryGrid}>
            <StatItem label="Total trades" value={formatCount(tradeStats.total)} />
            <StatItem label="24h trades" value={formatCount(tradeStats.last24h)} />
            <StatItem label="Opens" value={formatCount(tradeStats.mints)} />
            <StatItem label="Closes" value={formatCount(tradeStats.redeems)} />
            <StatItem
              label="Pool in use"
              value={
                vaultSummary?.snapshot?.utilization_bps != null
                  ? `${(vaultSummary.snapshot.utilization_bps / 100).toFixed(1)}%`
                  : "—"
              }
            />
          </div>
        ) : activeTab === "Market trades" ? (
          tradesLoading ? (
            <LoadingState label={ui.loadingTrades} compact />
          ) : trades.length > 0 ? (
            <MarketTradesTable trades={trades} />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No activity yet"
              description="Recent trades will show up here."
              compact
            />
          )
        ) : activeTab === "Positions" ? (
          !address ? (
            <EmptyState
              icon={Inbox}
              title="Connect wallet"
              description="Connect to see your open trades."
              compact
            />
          ) : positionsLoading ? (
            <LoadingState label="Loading positions…" compact />
          ) : positions.length > 0 ? (
            <LeverxPositionsTable
              positions={positions}
              markToMarket={byPositionId}
              isRefreshing={isRefreshing}
              owner={address ?? undefined}
              compact
              showHeader={false}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title={ui.emptyPositions}
              description={ui.emptyPositionsHint}
              compact
            />
          )
        ) : activeTab === "Open Orders" ? (
          !address ? (
            <EmptyState
              icon={Inbox}
              title="Connect wallet"
              description="Connect to see your waiting orders."
              compact
            />
          ) : ordersLoading ? (
            <LoadingState label="Loading orders…" compact />
          ) : limitOrders.length > 0 ? (
            <LeverxLimitOrdersTable orders={limitOrders} />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No waiting orders"
              description="Orders waiting for a match will appear here."
              compact
            />
          )
        ) : null}
      </div>
    </div>
  );
}

/** Stable key for trade UI state — avoids remounting forms on catalog/mark poll updates. */
function tradeContextKey(oracleId: string, side: PredictSide): string {
  return `${oracleId}:${side}`;
}

type PredictTradeLocationState = {
  predictSide?: PredictSide;
};

interface Props {
  oracleId: string;
}

export function PredictTradeTerminal({ oracleId }: Props) {
  const navSide = useRouterState({
    select: (s) => (s.location.state as PredictTradeLocationState | undefined)?.predictSide,
  });
  const [activeSide, setActiveSide] = useState<PredictSide>("up");
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Positions");
  const [positionsFilter, setPositionsFilter] = useState<"open" | "closed">("open");
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspaceTab>("trade");
  const [dockMounted, setDockMounted] = useState(false);
  const { address } = useWallet();

  useEffect(() => {
    setDockMounted(true);
  }, []);

  useEffect(() => {
    if (navSide === "up" || navSide === "down" || navSide === "range") {
      setActiveSide(navSide);
      return;
    }
    setActiveSide("up");
  }, [oracleId, navSide]);

  const { data: protocol } = useIndexerProtocol();
  const vaultId = protocol?.vault_id ?? undefined;
  const { data: vaultSummary } = useIndexerVaultSummary(vaultId);
  const { data: catalog = [] } = useMarketCatalog({ oracleId, limit: 200 });
  const { data: oracles = [] } = usePredictOracleRows();
  const { prev: prevOracle, next: nextOracle } = useOracleNeighbors(oracleId, {
    activeOnly: true,
  });
  const { data: oracleState } = usePredictOracleState(oracleId);
  const { data: latestPrice } = useOraclePriceLatest(oracleId);

  const oracleSummary = useMemo(
    () => oracles.find((o) => o.oracle_id === oracleId),
    [oracles, oracleId],
  );

  const chartAsset =
    baseFromUnderlying(oracleSummary?.underlying_asset ?? oracleState?.underlying_asset ?? "") ||
    oracleId.slice(2, 6).toUpperCase();

  const chartSeries = useChartPriceSeries(oracleId, chartAsset);

  const isOracleSettled = useMemo(
    () => isOracleSettledForTrade(oracleSummary, oracleState),
    [oracleSummary, oracleState],
  );

  const oracleSpot =
    latestPrice?.spot ??
    oracleState?.spot_price ??
    (oracleSummary?.settlement_price
      ? oracleSummary.settlement_price / 1e9
      : null);

  const marketRows = useMemo(() => {
    const rows = catalogToMarketRows(catalog);
    if (!oracleSummary) return rows;
    const spot = oracleSpot ?? undefined;
    return rows.map((row) => enrichMarketRow(row, oracleSummary, spot));
  }, [catalog, oracleSummary, oracleSpot]);
  const rangeBounds = useMemo(
    () =>
      resolveRangeBounds({
        oracleId,
        catalogRows: marketRows,
        oracle: oracleSummary,
        oracleSpot,
      }),
    [oracleId, marketRows, oracleSummary, oracleSpot],
  );

  const market = useMemo(
    () =>
      resolveTradeMarket({
        oracleId,
        oracle: oracleSummary,
        oracleSpot,
        catalogRows: marketRows,
        lowerStrikeRaw: rangeBounds?.lower,
        upperStrikeRaw: rangeBounds?.upper,
        side: activeSide,
      }),
    [oracleId, oracleSummary, oracleSpot, marketRows, rangeBounds, activeSide],
  );

  const { data: trades = [], isLoading: tradesLoading } = useIndexerGlobalTrades(oracleId);
  const { data: positions = [], isLoading: positionsLoading } = useIndexerPositions(address ?? undefined, {
    status: positionsFilter,
    oracleId,
  });
  const { data: limitOrders = [], isLoading: ordersLoading } = useIndexerLimitOrders(
    address ?? undefined,
    oracleId,
  );

  const asset = chartAsset || market?.asset || oracleId.slice(2, 6).toUpperCase();
  const expiry = market?.expiry ?? oracleSummary?.expiry ?? oracleState?.expiry;
  const isOracleExpired =
    expiry != null && expiry > 0 && expiry <= Date.now();
  const liquidity = vaultSummary?.snapshot?.nav
    ? scaleQuote(vaultSummary.snapshot.nav)
    : null;
  const tradeStats = useMemo(() => summarizeGlobalTrades(trades), [trades]);

  const rangeLower = rangeBounds?.lower ?? market?.strikeRaw;
  const rangeUpper = rangeBounds?.upper ?? market?.higherStrikeRaw;
  const binaryStrikeRaw = useMemo(() => {
    if (activeSide !== "range") {
      return market?.strikeRaw;
    }
    const up = marketRows.find((m) => m.oracleId === oracleId && !m.isRange && m.isUp);
    if (up?.strikeRaw) return up.strikeRaw;
    if (rangeBounds) {
      return Math.round((rangeBounds.lower + rangeBounds.upper) / 2);
    }
    if (oracleSummary && oracleSpot != null && oracleSpot > 0) {
      const minRaw =
        oracleSummary.min_strike != null && oracleSummary.min_strike > 0
          ? Math.round(oracleSummary.min_strike * 1e9)
          : 0;
      const tickRaw =
        oracleSummary.tick_size != null && oracleSummary.tick_size > 0
          ? Math.round(oracleSummary.tick_size * 1e9)
          : minRaw;
      return atmStrikeRaw(oracleSpot, minRaw, tickRaw);
    }
    return undefined;
  }, [activeSide, market?.strikeRaw, marketRows, oracleId, rangeBounds, oracleSummary, oracleSpot]);

  const question = useMemo(() => {
    if (activeSide === "range" && rangeLower && rangeUpper) {
      return `Will ${asset} settle in ${formatRangeStrikes(rangeLower / 1e9, rangeUpper / 1e9)}?`;
    }
    if (market?.question) return market.question;
    const strike = binaryStrikeRaw;
    if (strike && expiry) {
      return buildQuestion(
        asset,
        strike,
        expiry,
        activeSide === "range",
        rangeUpper ?? 0,
        activeSide === "up",
      );
    }
    return "Trade this market";
  }, [
    activeSide,
    rangeLower,
    rangeUpper,
    asset,
    market?.question,
    binaryStrikeRaw,
    expiry,
    rangeUpper,
  ]);

  const activePremium = market?.lastAskPremium;

  const chartStrikePrice = useMemo(() => {
    if (activeSide === "range") return undefined;
    if (market?.strikeRaw && market.strikeRaw > 0) return scaleSpot(market.strikeRaw);
    if (binaryStrikeRaw && binaryStrikeRaw > 0) return scaleSpot(binaryStrikeRaw);
    return undefined;
  }, [activeSide, rangeLower, rangeUpper, market?.strikeRaw, binaryStrikeRaw]);

  const chartRangeLower = rangeLower ? scaleSpot(rangeLower) : undefined;
  const chartRangeUpper = rangeUpper ? scaleSpot(rangeUpper) : undefined;

  const sessionKey = useMemo(
    () => tradeContextKey(oracleId, activeSide),
    [oracleId, activeSide],
  );
  const showMobileChart = mobileWorkspace === "chart";
  const showMobileTrade = mobileWorkspace === "trade";

  const positionsPanelProps: TradePositionsPanelProps = {
    activeTab,
    setActiveTab,
    tradesLoading,
    tradeStats,
    trades,
    positionsFilter,
    setPositionsFilter,
    address: address ?? null,
    positionsLoading,
    positions,
    ordersLoading,
    limitOrders,
    vaultSummary,
  };

  return (
    <section className={tradeTerminal}>
      <header className={tradeTerminalHeader}>
        <div className={tradeTerminalHeaderTop}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <AssetBadge asset={asset} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className={tradeTerminalTitle}>{question}</h1>
              <Link to="/markets" className={tradeTerminalBack}>
                {ui.backToMarkets}
              </Link>
            </div>
          </div>
          <div className={tradeOracleNav} aria-label="Market navigation">
            {prevOracle ? (
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId: prevOracle.oracle_id }}
                className={tradeOracleNavBtn}
                aria-label="Previous market"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span
                className={cn(tradeOracleNavBtn, tradeOracleNavBtnDisabled)}
                aria-hidden
              >
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
            {nextOracle ? (
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId: nextOracle.oracle_id }}
                className={tradeOracleNavBtn}
                aria-label="Next market"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span
                className={cn(tradeOracleNavBtn, tradeOracleNavBtnDisabled)}
                aria-hidden
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>

        <div className={tradeTerminalHeaderMetrics}>
          <div className={tradeStatRow}>
            <StatItem
              label={ui.markPrice}
              info={leverxInfo.markPrice}
              value={
                oracleSpot != null && oracleSpot > 0
                  ? formatPrice(asset, oracleSpot)
                  : DATA_PLACEHOLDER
              }
            />
            <StatItem
              label="Contract price"
              info={leverxInfo.premium}
              value={formatPremiumOrPlaceholder(activePremium)}
            />
            <StatItem
              label="Volume (24h)"
              info={leverxInfo.volume24h}
              value={formatUsdcOrPlaceholder(
                tradeStats.volume24h > 0 ? tradeStats.volume24h : null,
              )}
            />
            <StatItem
              label="Pool size"
              info={leverxInfo.vaultNav}
              value={formatUsdcOrPlaceholder(liquidity)}
            />
            <StatItem
              label="Closes"
              info={leverxInfo.autoClose}
              value={expiry ? formatAutoClose(expiry) : DATA_PLACEHOLDER}
            />
          </div>
        </div>
      </header>

      <div className={cn(tradeTerminalBody, tradeTerminalMobileBody)}>
        <div className={cn(tradeTerminalWorkspace, "trade-terminal-workspace-desktop")}>
          <TerminalPriceChart
            asset={asset}
            oracleId={oracleId}
            chartStrikePrice={chartStrikePrice}
            activeSide={activeSide}
            chartRangeLower={chartRangeLower}
            chartRangeUpper={chartRangeUpper}
            chartSeries={chartSeries}
          />
          <TerminalOrderBook
            oracleId={oracleId}
            market={market}
            activeSide={activeSide}
            onSideChange={setActiveSide}
          />
          <div className={tradeTerminalSidebar}>
            <PredictLeveragePanel
              key={sessionKey}
              oracleId={oracleId}
              side={activeSide}
              onSideChange={setActiveSide}
              expiryMs={expiry}
              strikeRaw={binaryStrikeRaw}
              lowerStrikeRaw={rangeLower}
              upperStrikeRaw={rangeUpper}
              lastAskPremium={market?.lastAskPremium ?? undefined}
              disabled={isOracleSettled || isOracleExpired}
            />
          </div>
          <TradePositionsPanel {...positionsPanelProps} />
        </div>

        <div
          className={cn(tradeTerminalWorkspace, tradeTerminalMobileChartPanel, "trade-terminal-workspace-mobile")}
          data-active={showMobileChart ? "true" : "false"}
        >
          <TerminalPriceChart
            asset={asset}
            oracleId={oracleId}
            chartStrikePrice={chartStrikePrice}
            activeSide={activeSide}
            chartRangeLower={chartRangeLower}
            chartRangeUpper={chartRangeUpper}
            layoutActive={showMobileChart}
            chartSeries={chartSeries}
          />
          <TerminalOrderBook
            oracleId={oracleId}
            market={market}
            activeSide={activeSide}
            onSideChange={setActiveSide}
            compact
          />
        </div>

        <div
          className={cn(tradeTerminalWorkspace, "trade-terminal-workspace-mobile")}
          data-active={showMobileTrade ? "true" : "false"}
        >
          <div className={tradeTerminalSidebar}>
            <PredictLeveragePanel
              key={sessionKey}
              oracleId={oracleId}
              side={activeSide}
              onSideChange={setActiveSide}
              expiryMs={expiry}
              strikeRaw={binaryStrikeRaw}
              lowerStrikeRaw={rangeLower}
              upperStrikeRaw={rangeUpper}
              lastAskPremium={market?.lastAskPremium ?? undefined}
              disabled={isOracleSettled || isOracleExpired}
            />
          </div>
          <TradePositionsPanel {...positionsPanelProps} />
        </div>
      </div>

      {dockMounted
        ? createPortal(
            <nav className={tradeMobileDock} aria-label="Trade workspace">
              <div className={tradeMobileDockTabs} role="tablist">
                {MOBILE_WORKSPACE_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={mobileWorkspace === tab}
                    className={cn(
                      tradeMobileDockTab,
                      mobileWorkspace === tab && tradeMobileDockTabActive,
                    )}
                    onClick={() => setMobileWorkspace(tab)}
                  >
                    {tab === "trade" ? "Trade" : "Chart"}
                  </button>
                ))}
              </div>
            </nav>,
            document.body,
          )
        : null}
    </section>
  );
}
