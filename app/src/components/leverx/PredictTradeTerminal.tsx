import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { LeverageWindowCountdown } from "@/components/leverx/LeverageWindowCountdown";
import { MarketFavoriteButton } from "@/components/leverx/MarketFavoriteButton";
import { MarketQuotePausedBadge } from "@/components/leverx/MarketQuotePausedBadge";
import { PredictLeveragePanel } from "@/components/leverx/PredictLeveragePanel";
import { LeverxLimitOrdersTable } from "@/components/leverx/LeverxLimitOrdersTable";
import { LeverxPositionsTable } from "@/components/leverx/LeverxPositionsTable";
import { MarketTradesTable } from "@/components/leverx/MarketTradesTable";
import { usePositionsMarkToMarket } from "@/hooks/usePositionsMarkToMarket";
import { useMinMdViewport } from "@/hooks/use-min-md-viewport";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { PriceChart } from "@/components/PriceChart";
import { PredictOrderBook } from "@/components/leverx/PredictOrderBook";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { AssetBadge } from "@/components/AssetBadge";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import {
  AnimatedAssetPrice,
  AnimatedCount,
  AnimatedPercent,
  AnimatedPremium,
} from "@/components/ui/animated-numbers";
import { useWallet } from "@/context/WalletContext";
import {
  useIndexerGlobalTrades,
  useIndexerLimitOrders,
  useIndexerPositions,
  useIndexerProtocol,
  useIndexerVaultSummary,
  useMarketCatalog,
} from "@/hooks/useIndexer";
import { useChartPriceSeries, type ChartDisplayMode } from "@/hooks/useChartPriceSeries";
import { CHART_OHLCV_INTERVAL, type OhlcvInterval } from "@/lib/deepbook/ohlcv";
import { useLiveContractPremium } from "@/hooks/useLiveContractPremium";
import { useNow } from "@/hooks/useNow";
import { useOraclePriceLatest } from "@/hooks/useOracleSpotPriceSeries";
import { useOracleNeighbors, usePredictOracleRows } from "@/hooks/usePredictOracles";
import { usePredictOracleState } from "@/hooks/usePredictOracleState";
import {
  buildQuestion,
  catalogToMarketRows,
} from "@/lib/leverx/indexer-markets";
import {
  atmStrikeRaw,
  enrichMarketRow,
  resolveRangeBounds,
  resolveTradeMarket,
} from "@/lib/leverx/predict-oracle-markets";
import { oracleStrikeBounds } from "@/lib/leverx/strike-selection";
import { baseFromUnderlying } from "@/lib/markets";
import { summarizeGlobalTrades } from "@/lib/leverx/trade-stats";
import { LEVERAGED_MINT_WINDOW_MS } from "@/lib/leverx/constants";
import {
  formatMarketCloses,
  isFinalHourBeforeExpiry,
} from "@/lib/leverx/trade-limits";
import {
  buildPositionStrikeChartLevels,
  buildStrikeChartLevels,
} from "@/lib/charts/predict-chart-levels";
import { isActiveOpenPosition } from "@/lib/leverx/position-metrics";
import { formatCount, ui } from "@/lib/copy";
import { DATA_PLACEHOLDER } from "@/lib/leverx/placeholders";
import { formatRangeStrikes, coercePredictSide, type PredictSide } from "@/lib/predict/instruments";
import { isOracleSettledForTrade, shouldPatchOhlcvWithOracleSpot } from "@/lib/predict/oracles";
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
  tradeTerminalHeaderMetricsRow,
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
  positionsLoading: boolean,
  positionCount: number,
  ordersLoading: boolean,
  orderCount: number,
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
    const count = ordersLoading ? "…" : formatCount(orderCount);
    return (
      <>
        <span className="sm:hidden">Orders ({count})</span>
        <span className="hidden sm:inline">Open Orders ({count})</span>
      </>
    );
  }
  if (tab === "Positions") {
    const count = positionsLoading ? "…" : formatCount(positionCount);
    return (
      <>
        <span className="max-[380px]:hidden">Positions ({count})</span>
        <span className="hidden max-[380px]:inline">Pos ({count})</span>
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

function StatItem({
  label,
  value,
  info,
  tone,
}: {
  label: string;
  value: ReactNode;
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

function TerminalPriceChart({
  asset,
  oracleId,
  chartStrikePrice,
  chartStrikeLevels,
  activeSide,
  chartRangeLower,
  chartRangeUpper,
  layoutActive = true,
  chartSeries,
  interval,
  onIntervalChange,
  displayMode,
  onDisplayModeChange,
}: {
  asset: string;
  oracleId: string;
  chartStrikePrice?: number;
  chartStrikeLevels?: ReturnType<typeof buildPositionStrikeChartLevels>;
  activeSide: PredictSide;
  chartRangeLower?: number;
  chartRangeUpper?: number;
  layoutActive?: boolean;
  chartSeries: ReturnType<typeof useChartPriceSeries>;
  interval: OhlcvInterval;
  onIntervalChange: (interval: OhlcvInterval) => void;
  displayMode: ChartDisplayMode;
  onDisplayModeChange: (mode: ChartDisplayMode) => void;
}) {
  return (
    <div className={tradeTerminalChart}>
      <PriceChart
        asset={asset}
        oracleId={oracleId}
        chartSeries={chartSeries}
        strikePrice={chartStrikePrice}
        strikeLevels={chartStrikeLevels}
        activeSide={activeSide}
        rangeLower={chartRangeLower}
        rangeUpper={chartRangeUpper}
        layoutActive={layoutActive}
        interval={interval}
        onIntervalChange={onIntervalChange}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
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
  positionCount: number;
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
  positionCount,
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
            label: tradeTabLabel(
              tab,
              tradesLoading,
              formatCount(tradeStats.total),
              positionsLoading,
              positionCount,
              ordersLoading,
              limitOrders.length,
            ),
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
            <StatItem label="Total trades" value={<AnimatedCount value={tradeStats.total} />} />
            <StatItem label="24h trades" value={<AnimatedCount value={tradeStats.last24h} />} />
            <StatItem label="Opens" value={<AnimatedCount value={tradeStats.mints} />} />
            <StatItem label="Closes" value={<AnimatedCount value={tradeStats.redeems} />} />
            <StatItem
              label="Pool in use"
              value={
                vaultSummary?.snapshot?.utilization_bps != null ? (
                  <AnimatedPercent
                    value={vaultSummary.snapshot.utilization_bps / 10_000}
                    fractionDigits={1}
                  />
                ) : (
                  "—"
                )
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
              paginationKey={positionsFilter}
              hideLiveMetrics={positionsFilter === "closed"}
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
  const [selectedStrikeRaw, setSelectedStrikeRaw] = useState<number | undefined>();
  const [selectedRangeLower, setSelectedRangeLower] = useState<number | undefined>();
  const [selectedRangeUpper, setSelectedRangeUpper] = useState<number | undefined>();
  const [chartInterval, setChartInterval] = useState<OhlcvInterval>(CHART_OHLCV_INTERVAL);
  const [chartDisplayMode, setChartDisplayMode] = useState<ChartDisplayMode>("candlestick");
  const { address } = useWallet();

  useEffect(() => {
    setDockMounted(true);
  }, []);

  useEffect(() => {
    if (navSide === "up" || navSide === "down" || navSide === "range") {
      setActiveSide(coercePredictSide(navSide));
      return;
    }
    setActiveSide("up");
  }, [oracleId, navSide]);

  const { data: protocol } = useIndexerProtocol();
  const vaultId = protocol?.vault_id ?? undefined;
  const { data: vaultSummary } = useIndexerVaultSummary(vaultId);
  const { data: catalog = [] } = useMarketCatalog({ oracleId, limit: 200 });
  const { data: oracles = [], refetch: refetchOracles } = usePredictOracleRows();
  const { prev: prevOracle, next: nextOracle } = useOracleNeighbors(oracleId, {
    activeOnly: true,
  });

  const oracleSummary = useMemo(
    () => oracles.find((o) => o.oracle_id === oracleId),
    [oracles, oracleId],
  );

  const now = useNow(1000);
  const expiryForPolling = oracleSummary?.expiry;
  const oracleStateRefetchMs = useMemo(() => {
    if (!expiryForPolling || expiryForPolling <= 0) return 60_000;
    if (expiryForPolling <= now) return 5_000;
    if (expiryForPolling - now < LEVERAGED_MINT_WINDOW_MS) return 15_000;
    return 60_000;
  }, [expiryForPolling, now]);

  const { data: oracleState } = usePredictOracleState(oracleId, {
    refetchInterval: oracleStateRefetchMs,
  });
  const { data: latestPrice } = useOraclePriceLatest(oracleId);

  const chartAsset =
    baseFromUnderlying(oracleSummary?.underlying_asset ?? oracleState?.underlying_asset ?? "") ||
    oracleId.slice(2, 6).toUpperCase();

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
  useEffect(() => {
    setSelectedStrikeRaw(undefined);
    setSelectedRangeLower(undefined);
    setSelectedRangeUpper(undefined);
  }, [oracleId, activeSide]);

  const oracleStrikeConfig = useMemo(
    () =>
      oracleStrikeBounds({
        minStrike: oracleSummary?.min_strike,
        tickSize: oracleSummary?.tick_size,
      }),
    [oracleSummary?.min_strike, oracleSummary?.tick_size],
  );

  const defaultBinaryStrikeRaw = useMemo(() => {
    if (oracleSpot != null && oracleSpot > 0) {
      return atmStrikeRaw(
        oracleSpot,
        oracleStrikeConfig.minStrikeRaw,
        oracleStrikeConfig.tickSizeRaw,
      );
    }
    return 0;
  }, [oracleSpot, oracleStrikeConfig]);

  const activeBinaryStrikeRaw = useMemo(() => {
    if (activeSide === "range") return 0;
    return selectedStrikeRaw ?? defaultBinaryStrikeRaw;
  }, [activeSide, selectedStrikeRaw, defaultBinaryStrikeRaw]);

  const rangeBounds = useMemo(
    () =>
      resolveRangeBounds({
        oracleId,
        catalogRows: marketRows,
        oracle: oracleSummary,
        oracleSpot,
        lowerStrikeRaw: selectedRangeLower,
        upperStrikeRaw: selectedRangeUpper,
      }),
    [
      oracleId,
      marketRows,
      oracleSummary,
      oracleSpot,
      selectedRangeLower,
      selectedRangeUpper,
    ],
  );

  const handleRangeBoundsChange = useCallback((lower: number, upper: number) => {
    setSelectedRangeLower(lower);
    setSelectedRangeUpper(upper);
  }, []);

  const market = useMemo(
    () =>
      resolveTradeMarket({
        oracleId,
        oracle: oracleSummary,
        oracleSpot,
        catalogRows: marketRows,
        strikeRaw:
          activeSide !== "range" && activeBinaryStrikeRaw > 0
            ? activeBinaryStrikeRaw
            : undefined,
        lowerStrikeRaw: rangeBounds?.lower,
        upperStrikeRaw: rangeBounds?.upper,
        side: activeSide,
      }),
    [
      oracleId,
      oracleSummary,
      oracleSpot,
      marketRows,
      rangeBounds,
      activeSide,
      activeBinaryStrikeRaw,
    ],
  );

  const { data: trades = [], isLoading: tradesLoading } = useIndexerGlobalTrades(oracleId);
  const {
    data: openPositions = [],
    isLoading: openPositionsLoading,
  } = useIndexerPositions(address ?? undefined, { status: "open", oracleId });
  const {
    data: closedPositions = [],
    isLoading: closedPositionsLoading,
  } = useIndexerPositions(address ?? undefined, { status: "closed", oracleId });
  const { data: limitOrders = [], isLoading: ordersLoading } = useIndexerLimitOrders(
    address ?? undefined,
    oracleId,
  );

  const openOraclePositions = useMemo(
    () => openPositions.filter(isActiveOpenPosition),
    [openPositions],
  );

  const displayPositions = useMemo(
    () => (positionsFilter === "open" ? openOraclePositions : closedPositions),
    [positionsFilter, openOraclePositions, closedPositions],
  );

  const positionsLoading =
    positionsFilter === "open" ? openPositionsLoading : closedPositionsLoading;

  const handleTradeSuccess = useCallback(
    ({ orderType }: { orderType: "market" | "limit" }) => {
      if (orderType === "limit") {
        setActiveTab("Open Orders");
      } else {
        setActiveTab("Positions");
      }
    },
    [setActiveTab],
  );

  const asset = chartAsset || market?.asset || oracleId.slice(2, 6).toUpperCase();
  const expiry = market?.expiry ?? oracleSummary?.expiry ?? oracleState?.expiry;
  const isOracleExpired =
    expiry != null && expiry > 0 && expiry <= now;
  const inFinalHour = Boolean(
    expiry &&
      expiry > now &&
      isFinalHourBeforeExpiry(expiry, LEVERAGED_MINT_WINDOW_MS, now),
  );

  const expiredRefetchDone = useRef(false);
  useEffect(() => {
    expiredRefetchDone.current = false;
  }, [oracleId]);
  useEffect(() => {
    if (!isOracleExpired || expiredRefetchDone.current) return;
    expiredRefetchDone.current = true;
    void refetchOracles();
  }, [isOracleExpired, refetchOracles]);
  const liquidity = vaultSummary?.snapshot?.nav
    ? scaleQuote(vaultSummary.snapshot.nav)
    : null;
  const tradeStats = useMemo(() => summarizeGlobalTrades(trades), [trades]);

  const rangeLower = rangeBounds?.lower ?? market?.strikeRaw;
  const rangeUpper = rangeBounds?.upper ?? market?.higherStrikeRaw;

  const question = useMemo(() => {
    if (activeSide === "range" && rangeLower && rangeUpper) {
      return `Will ${asset} settle in ${formatRangeStrikes(rangeLower / 1e9, rangeUpper / 1e9)}?`;
    }
    if (market?.question) return market.question;
    const strike = activeBinaryStrikeRaw;
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
    activeBinaryStrikeRaw,
    expiry,
    rangeUpper,
  ]);

  const contractPremium = useLiveContractPremium({
    oracleId,
    expiryMs: expiry,
    strikeRaw: activeSide === "range" ? rangeLower : activeBinaryStrikeRaw || undefined,
    higherStrikeRaw: activeSide === "range" ? rangeUpper : undefined,
    side: activeSide,
    catalogPremium: market?.lastAskPremium,
  });

  const patchChartWithOracleSpot = useMemo(
    () =>
      shouldPatchOhlcvWithOracleSpot(oracleSummary, oracleState) &&
      !contractPremium.quotePaused,
    [oracleSummary, oracleState, contractPremium.quotePaused],
  );

  const chartSeries = useChartPriceSeries(oracleId, chartAsset, {
    oracleRow: oracleSummary,
    oracleDetail: oracleState,
    patchWithOracleSpot: patchChartWithOracleSpot,
    interval: chartInterval,
  });

  const chartStrikePrice = useMemo(() => {
    if (activeSide === "range") return undefined;
    if (activeBinaryStrikeRaw > 0) return scaleSpot(activeBinaryStrikeRaw);
    return undefined;
  }, [activeSide, activeBinaryStrikeRaw]);

  const chartRangeLower = rangeLower ? scaleSpot(rangeLower) : undefined;
  const chartRangeUpper = rangeUpper ? scaleSpot(rangeUpper) : undefined;

  const chartStrikeLevels = useMemo(() => {
    if (openOraclePositions.length > 0) {
      return buildPositionStrikeChartLevels(
        openOraclePositions.map((position) => ({
          isUp: position.is_up,
          isRange: position.is_range,
          strikeRaw: position.strike,
          higherStrikeRaw: position.higher_strike,
        })),
      );
    }
    return buildStrikeChartLevels({
      activeSide,
      strikePrice: chartStrikePrice,
      rangeLower: chartRangeLower,
      rangeUpper: chartRangeUpper,
    });
  }, [
    openOraclePositions,
    activeSide,
    chartStrikePrice,
    chartRangeLower,
    chartRangeUpper,
  ]);

  const sessionKey = useMemo(
    () => tradeContextKey(oracleId, activeSide),
    [oracleId, activeSide],
  );
  const showMobileChart = mobileWorkspace === "chart";
  const showMobileTrade = mobileWorkspace === "trade";
  const isMdViewport = useMinMdViewport();
  const desktopChartActive = isMdViewport;
  const mobileChartActive = !isMdViewport && showMobileChart;

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
    positions: displayPositions,
    positionCount: displayPositions.length,
    ordersLoading,
    limitOrders,
    vaultSummary,
  };

  return (
    <section className={cn(tradeTerminal, "trade-terminal")}>
      <header className={cn(tradeTerminalHeader, "trade-terminal-header")}>
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
          <div className="flex shrink-0 items-center gap-2">
            {market?.id ? (
              <MarketFavoriteButton
                marketId={market.id}
                labeled
                className="shrink-0"
              />
            ) : null}
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
        </div>

        <div className={tradeTerminalHeaderMetrics}>
          <div className={tradeTerminalHeaderMetricsRow}>
            <div className={tradeStatRow}>
              <StatItem
                label={ui.markPrice}
                info={leverxInfo.markPrice}
                value={
                  oracleSpot != null && oracleSpot > 0 ? (
                    <AnimatedAssetPrice value={oracleSpot} />
                  ) : (
                    DATA_PLACEHOLDER
                  )
                }
              />
              <StatItem
                label="Contract price"
                info={leverxInfo.premium}
                value={
                  contractPremium.quotePaused ? (
                    <MarketQuotePausedBadge className="mt-0" />
                  ) : contractPremium.isLoading ? (
                    "…"
                  ) : (
                    <AnimatedPremium value={contractPremium.premiumRaw} />
                  )
                }
                tone={contractPremium.quotePaused ? "destructive" : undefined}
              />
              <StatItem
                label="Volume (24h)"
                info={leverxInfo.volume24h}
                value={
                  <QuoteAmount
                    amount={tradeStats.volume24h > 0 ? tradeStats.volume24h : null}
                    hideZero
                  />
                }
              />
              <StatItem
                label="Pool size"
                info={leverxInfo.vaultNav}
                value={<QuoteAmount amount={liquidity} hideZero />}
              />
              <StatItem
                label="Closes"
                info={inFinalHour ? leverxInfo.leveragedMintWindow : leverxInfo.autoClose}
                value={expiry ? formatMarketCloses(expiry, now) : DATA_PLACEHOLDER}
                tone={isOracleExpired ? "destructive" : inFinalHour ? "destructive" : undefined}
              />
            </div>
            <LeverageWindowCountdown expiryMs={expiry} className="lg:self-center" />
          </div>
        </div>
      </header>

      <div className={cn(tradeTerminalBody, tradeTerminalMobileBody)}>
        <div className={cn(tradeTerminalWorkspace, "trade-terminal-workspace-desktop")}>
          <TerminalPriceChart
            asset={asset}
            oracleId={oracleId}
            chartStrikePrice={chartStrikePrice}
            chartStrikeLevels={chartStrikeLevels}
            activeSide={activeSide}
            chartRangeLower={chartRangeLower}
            chartRangeUpper={chartRangeUpper}
            layoutActive={desktopChartActive}
            chartSeries={chartSeries}
            interval={chartInterval}
            onIntervalChange={setChartInterval}
            displayMode={chartDisplayMode}
            onDisplayModeChange={setChartDisplayMode}
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
              oracleSpotUsd={oracleSpot}
              minStrikeRaw={oracleStrikeConfig.minStrikeRaw}
              tickSizeRaw={oracleStrikeConfig.tickSizeRaw}
              onStrikeRawChange={setSelectedStrikeRaw}
              onRangeBoundsChange={handleRangeBoundsChange}
              binaryStrikeRaw={activeBinaryStrikeRaw > 0 ? activeBinaryStrikeRaw : undefined}
              lowerStrikeRaw={rangeLower}
              upperStrikeRaw={rangeUpper}
              lastAskPremium={contractPremium.premiumRaw ?? undefined}
              openPositions={openOraclePositions}
              disabled={isOracleSettled || isOracleExpired}
              onTradeSuccess={handleTradeSuccess}
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
            chartStrikeLevels={chartStrikeLevels}
            activeSide={activeSide}
            chartRangeLower={chartRangeLower}
            chartRangeUpper={chartRangeUpper}
            layoutActive={mobileChartActive}
            chartSeries={chartSeries}
            interval={chartInterval}
            onIntervalChange={setChartInterval}
            displayMode={chartDisplayMode}
            onDisplayModeChange={setChartDisplayMode}
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
              oracleSpotUsd={oracleSpot}
              minStrikeRaw={oracleStrikeConfig.minStrikeRaw}
              tickSizeRaw={oracleStrikeConfig.tickSizeRaw}
              onStrikeRawChange={setSelectedStrikeRaw}
              onRangeBoundsChange={handleRangeBoundsChange}
              binaryStrikeRaw={activeBinaryStrikeRaw > 0 ? activeBinaryStrikeRaw : undefined}
              lowerStrikeRaw={rangeLower}
              upperStrikeRaw={rangeUpper}
              lastAskPremium={contractPremium.premiumRaw ?? undefined}
              openPositions={openOraclePositions}
              disabled={isOracleSettled || isOracleExpired}
              onTradeSuccess={handleTradeSuccess}
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
