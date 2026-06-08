import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { PredictLeveragePanel } from "@/components/leverx/PredictLeveragePanel";
import { LeverxCancelOrderButton } from "@/components/leverx/LeverxPositionActions";
import { PositionRiskMenu } from "@/components/leverx/PositionRiskMenu";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { PriceChart } from "@/components/PriceChart";
import { PredictOrderBook } from "@/components/leverx/PredictOrderBook";
import { buildPredictChartLevels } from "@/lib/charts/predict-chart-levels";
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
import { useOracleSpotMap } from "@/hooks/useOracleSpotMap";
import { useOracleNeighbors, usePredictOracleRows } from "@/hooks/usePredictOracles";
import { usePredictOracleState } from "@/hooks/usePredictOracleState";
import {
  catalogToMarketRows,
  formatPremiumCents,
  formatPremiumOrPlaceholder,
} from "@/lib/leverx/indexer-markets";
import {
  atmStrikeRaw,
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
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

const TABS = ["Positions", "Open Orders", "Market trades", "Summary"] as const;

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

interface Props {
  oracleId: string;
  strikeRaw?: number;
  lowerStrikeRaw?: number;
  upperStrikeRaw?: number;
  side?: PredictSide;
}

export function PredictTradeTerminal({
  oracleId,
  strikeRaw,
  lowerStrikeRaw,
  upperStrikeRaw,
  side = "up",
}: Props) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Positions");
  const [positionsFilter, setPositionsFilter] = useState<"open" | "closed">("open");
  const { address } = useWallet();

  const { data: protocol } = useIndexerProtocol();
  const vaultId = protocol?.vault_id ?? undefined;
  const { data: vaultSummary } = useIndexerVaultSummary(vaultId);
  const { data: catalog = [] } = useMarketCatalog({ oracleId, limit: 200 });
  const { data: oracles = [] } = usePredictOracleRows();
  const { prev: prevOracle, next: nextOracle } = useOracleNeighbors(oracleId);
  const { data: oracleState } = usePredictOracleState(oracleId);
  const { data: spotMap } = useOracleSpotMap([oracleId]);

  const oracleSummary = useMemo(
    () => oracles.find((o) => o.oracle_id === oracleId),
    [oracles, oracleId],
  );

  const marketRows = useMemo(() => catalogToMarketRows(catalog), [catalog]);
  const activeSide = side ?? "up";

  const oracleSpot =
    spotMap?.get(oracleId) ??
    oracleState?.spot_price ??
    (oracleSummary?.settlement_price
      ? oracleSummary.settlement_price / 1e9
      : null);

  const rangeBounds = useMemo(
    () =>
      resolveRangeBounds({
        oracleId,
        catalogRows: marketRows,
        oracle: oracleSummary,
        oracleSpot,
        strikeRaw,
        lowerStrikeRaw,
        upperStrikeRaw,
      }),
    [
      oracleId,
      marketRows,
      oracleSummary,
      oracleSpot,
      strikeRaw,
      lowerStrikeRaw,
      upperStrikeRaw,
    ],
  );

  const market = useMemo(
    () =>
      resolveTradeMarket({
        oracleId,
        oracle: oracleSummary,
        oracleSpot,
        catalogRows: marketRows,
        strikeRaw,
        lowerStrikeRaw: rangeBounds?.lower ?? lowerStrikeRaw,
        upperStrikeRaw: rangeBounds?.upper ?? upperStrikeRaw,
        side: activeSide,
      }),
    [
      oracleId,
      oracleSummary,
      oracleSpot,
      marketRows,
      strikeRaw,
      lowerStrikeRaw,
      upperStrikeRaw,
      rangeBounds,
      activeSide,
    ],
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

  const asset =
    market?.asset ??
    (baseFromUnderlying(oracleSummary?.underlying_asset ?? oracleState?.underlying_asset ?? "") ||
      oracleId.slice(2, 6).toUpperCase());
  const expiry = market?.expiry ?? oracleSummary?.expiry ?? oracleState?.expiry;
  const liquidity = vaultSummary?.snapshot?.nav
    ? scaleQuote(vaultSummary.snapshot.nav)
    : null;
  const tradeStats = useMemo(() => summarizeGlobalTrades(trades), [trades]);

  const rangeLower = rangeBounds?.lower ?? market?.strikeRaw;
  const rangeUpper = rangeBounds?.upper ?? market?.higherStrikeRaw;
  const binaryStrikeRaw = useMemo(() => {
    if (activeSide !== "range") {
      return market?.strikeRaw ?? strikeRaw;
    }
    if (strikeRaw) return strikeRaw;
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
  }, [
    activeSide,
    market?.strikeRaw,
    strikeRaw,
    marketRows,
    oracleId,
    rangeBounds,
    oracleSummary,
    oracleSpot,
  ]);

  const question =
    activeSide === "range" && rangeLower && rangeUpper
      ? `Will ${asset} settle in ${formatRangeStrikes(rangeLower / 1e9, rangeUpper / 1e9)}?`
      : (market?.question ?? `Trade this market`);

  const activePremium = market?.lastAskPremium;

  const chartLevels = useMemo(
    () =>
      buildPredictChartLevels({
        strikeRaw: market?.strikeRaw,
        lowerStrikeRaw: rangeLower,
        upperStrikeRaw: rangeUpper,
        spot: oracleSpot ?? undefined,
        activeSide,
      }),
    [market?.strikeRaw, rangeLower, rangeUpper, oracleSpot, activeSide],
  );

  const chartStrikePrice = useMemo(() => {
    if (activeSide === "range" && rangeLower && rangeUpper) {
      return scaleSpot(Math.round((rangeLower + rangeUpper) / 2));
    }
    if (market?.strikeRaw && market.strikeRaw > 0) return scaleSpot(market.strikeRaw);
    if (binaryStrikeRaw && binaryStrikeRaw > 0) return scaleSpot(binaryStrikeRaw);
    return undefined;
  }, [activeSide, rangeLower, rangeUpper, market?.strikeRaw, binaryStrikeRaw]);

  const chartRangeLower = rangeLower ? scaleSpot(rangeLower) : undefined;
  const chartRangeUpper = rangeUpper ? scaleSpot(rangeUpper) : undefined;

  const oracleNavSearch = {
    strike: strikeRaw,
    lowerStrike: lowerStrikeRaw,
    upperStrike: upperStrikeRaw,
    side: activeSide,
  };

  return (
    <section className={tradeTerminal}>
      <header className={tradeTerminalHeader}>
        <div className={tradeTerminalHeaderTop}>
          <div className={tradeOracleNav} aria-label="Market navigation">
            {prevOracle ? (
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId: prevOracle.oracle_id }}
                search={oracleNavSearch}
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
                search={oracleNavSearch}
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
          <AssetBadge asset={asset} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className={tradeTerminalTitle}>{question}</h1>
            <Link to="/markets" className={tradeTerminalBack}>
              {ui.backToMarkets}
            </Link>
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

      <div className={tradeTerminalBody}>
        <div className={tradeTerminalWorkspace}>
          <div className={tradeTerminalChart}>
            <PriceChart
              asset={asset}
              oracleId={oracleId}
              spotPrice={oracleSpot}
              levels={chartLevels}
              strikePrice={chartStrikePrice}
              activeSide={activeSide}
              rangeLower={chartRangeLower}
              rangeUpper={chartRangeUpper}
            />
          </div>
          <div className={cn(tradeTerminalOrderbook, "min-h-[280px]")}>
            <PredictOrderBook
              oracleId={oracleId}
              expiryMs={market?.expiry ?? 0}
              strike={market?.strikeRaw ?? 0}
              higherStrike={market?.higherStrikeRaw ?? 0}
              isUp={market?.isUp ?? activeSide === "up"}
              isRange={market?.isRange ?? activeSide === "range"}
              placeholder={!market || market.strikeRaw <= 0 || !market.expiry}
            />
          </div>
          <div className={tradeTerminalSidebar}>
            <PredictLeveragePanel
              oracleId={oracleId}
              side={activeSide}
              expiryMs={expiry}
              strikeRaw={binaryStrikeRaw}
              lowerStrikeRaw={rangeLower}
              upperStrikeRaw={rangeUpper}
              lastAskPremium={market?.lastAskPremium ?? undefined}
            />
          </div>

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
                  <div className="w-full space-y-2 text-left">
                    {trades.slice(0, 12).map((t) => (
                      <div
                        key={t.event_digest}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/40 pb-2 font-mono text-xs"
                      >
                        <span className="flex items-center gap-1.5">
                          {t.trade_side === "mint" ? (
                            <ArrowUpRight className="h-3 w-3 text-success" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 text-destructive" />
                          )}
                          <span className={t.is_up ? "text-success" : "text-destructive"}>
                            {t.trade_side === "mint" ? "OPEN" : "CLOSE"}{" "}
                            {t.is_up ? "UP" : "DOWN"}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(t.timestamp_ms).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-foreground">
                          {t.ask_price
                            ? formatPremiumCents(t.ask_price)
                            : t.bid_price
                              ? formatPremiumCents(t.bid_price)
                              : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
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
                  <div className="w-full space-y-2 text-left">
                    {positions.map((p) => (
                      <div
                        key={`${p.position_key}-${p.account_id}`}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-xs"
                      >
                        <span className="font-medium">
                          {p.is_up ? "UP" : "DOWN"} · qty {p.open_quantity.toLocaleString()}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          margin {formatUsdcOrPlaceholder(scaleQuote(p.margin_quote))}
                        </span>
                        <span className="text-muted-foreground">{p.status}</span>
                        {p.status === "open" ? (
                          <PositionRiskMenu position={p} owner={address ?? undefined} />
                        ) : null}
                      </div>
                    ))}
                  </div>
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
                  <div className="w-full space-y-2 text-left">
                    {limitOrders.map((o) => (
                      <div
                        key={o.placed_event_digest}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-xs"
                      >
                        <span>
                          {o.is_up ? "UP" : "DOWN"} limit @{" "}
                          {formatPremiumCents(o.limit_premium_per_unit)}
                        </span>
                        <span className="font-mono">qty {o.quantity.toLocaleString()}</span>
                        <span className="text-muted-foreground">{o.status}</span>
                        {o.status === "open" ? (
                          <LeverxCancelOrderButton order={o} owner={address ?? undefined} />
                        ) : null}
                      </div>
                    ))}
                  </div>
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
        </div>
      </div>
    </section>
  );
}
