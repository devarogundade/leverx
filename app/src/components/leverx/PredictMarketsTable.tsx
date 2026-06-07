import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, BarChart3, Bookmark, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MarketTableSkeleton } from "@/components/ui/market-skeleton";
import { AssetBadge } from "@/components/AssetBadge";
import { MarketSideActions } from "@/components/leverx/MarketSideActions";
import {
  MARKETS_TABLE_PAGE_SIZE,
  MarketCatalogPagination,
  paginateSlice,
} from "@/components/leverx/MarketCatalogPagination";
import {
  formatPremiumOrPlaceholder,
  rangeBoundsForRow,
  type LeverxMarketRow,
} from "@/lib/leverx/indexer-markets";
import { formatCompactUsdOrPlaceholder } from "@/lib/leverx/placeholders";
import { ui } from "@/lib/copy";
import {
  leverageBadge,
  marketsBookmark,
  marketsMarketCell,
  marketsMarketLink,
  marketsPriceCell,
  marketsPriceValue,
  marketsRow,
  marketsTable,
  marketsTableDesktop,
  marketsTableMobileCard,
  marketsTableMobileCardHeader,
  marketsTableMobileCardStats,
  marketsTableMobileList,
  marketsTableMobileStatLabel,
  marketsTableMobileStatValue,
  marketsTableScroll,
  marketsTableShell,
  marketsTd,
  marketsTdHideLg,
  marketsTdHideMd,
  marketsTdHideSm,
  marketsTdMarket,
  marketsTdMono,
  marketsTdMuted,
  marketsTdTrade,
  marketsTh,
  marketsThBtn,
  marketsThBtnRight,
  marketsThHideLg,
  marketsThHideMd,
  marketsThHideSm,
  marketsThMarket,
  marketsThSortActive,
  marketsThTrade,
  marketsTradeActions,
  pageState,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

type SortKey = "price" | "volume" | "liquidity" | "expiry";
type SortDir = "asc" | "desc";

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

function SortHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      className={cn(marketsThBtn, align === "right" && marketsThBtnRight)}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={cn("inline-flex items-center", active && marketsThSortActive)}>
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </button>
  );
}

function MarketMobileCard({
  market: m,
  liquidityLabel,
}: {
  market: LeverxMarketRow;
  liquidityLabel: string;
}) {
  const range = rangeBoundsForRow(m);
  const side = m.isRange ? ("range" as const) : m.isUp ? ("up" as const) : ("down" as const);

  return (
    <article className={marketsTableMobileCard}>
      <div className={marketsTableMobileCardHeader}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={marketsBookmark}
          aria-label="Bookmark market"
        >
          <Bookmark className="h-3.5 w-3.5" />
        </Button>
        <AssetBadge asset={m.asset} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to="/predictions/$oracleId"
            params={{ oracleId: m.oracleId }}
            search={
              m.isRange
                ? {
                    side: "range",
                    lowerStrike: m.strikeRaw,
                    upperStrike: m.higherStrikeRaw,
                  }
                : { strike: m.strikeRaw, side }
            }
            className={cn(marketsMarketLink, "font-medium")}
          >
            {m.question}
          </Link>
          <span className={cn(leverageBadge, "mt-1")}>10X</span>
        </div>
        <div className={marketsPriceCell}>
          <span className={marketsPriceValue}>
            {formatPremiumOrPlaceholder(m.lastAskPremium)}
          </span>
        </div>
      </div>

      <dl className={marketsTableMobileCardStats}>
        <div>
          <dt className={marketsTableMobileStatLabel}>Volume</dt>
          <dd className={cn(marketsTableMobileStatValue, "font-mono tabular-nums")}>
            {formatCompactUsdOrPlaceholder(m.volume > 0 ? m.volume : null)}
          </dd>
        </div>
        <div>
          <dt className={marketsTableMobileStatLabel}>Liquidity</dt>
          <dd className={cn(marketsTableMobileStatValue, "font-mono tabular-nums")}>
            {liquidityLabel}
          </dd>
        </div>
        <div>
          <dt className={marketsTableMobileStatLabel}>Auto close</dt>
          <dd className={cn(marketsTableMobileStatValue, "text-muted-foreground")}>
            {m.expiry ? formatAutoClose(m.expiry) : "—"}
          </dd>
        </div>
      </dl>

      <MarketSideActions
        oracleId={m.oracleId}
        strikeRaw={m.strikeRaw}
        rangeLower={range?.lower}
        rangeUpper={range?.upper}
        stretch
      />
    </article>
  );
}

interface Props {
  markets: LeverxMarketRow[];
  liquidityLabel?: string;
  loading?: boolean;
  offline?: boolean;
}

export function PredictMarketsTable({
  markets,
  liquidityLabel = "_",
  loading,
  offline,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [markets.length, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "expiry" ? "asc" : "desc");
  };

  const sortedMarkets = useMemo(() => {
    const rows = [...markets];
    const factor = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "price":
          return ((a.lastAskPremium ?? 0) - (b.lastAskPremium ?? 0)) * factor;
        case "volume":
          return (a.volume - b.volume) * factor;
        case "liquidity":
          return (a.volume - b.volume) * factor;
        case "expiry":
          return (a.expiry - b.expiry) * factor;
        default:
          return 0;
      }
    });
    return rows;
  }, [markets, sortKey, sortDir]);

  const { items: pageMarkets, page: currentPage, totalPages, totalItems } = useMemo(
    () => paginateSlice(sortedMarkets, page, MARKETS_TABLE_PAGE_SIZE),
    [sortedMarkets, page],
  );

  if (loading) {
    return <MarketTableSkeleton />;
  }

  if (markets.length === 0 && !offline) {
    return (
      <div className={pageState}>
        <EmptyState
          icon={BarChart3}
          title={ui.emptyMarkets}
          description={ui.emptyMarketsHint}
        />
      </div>
    );
  }

  if (markets.length === 0 && offline) {
    return <MarketTableSkeleton />;
  }

  return (
    <div className={marketsTableShell}>
      <div className={marketsTableMobileList}>
        {pageMarkets.map((m) => (
          <MarketMobileCard key={m.id} market={m} liquidityLabel={liquidityLabel} />
        ))}
      </div>

      <div className={cn(marketsTableScroll, marketsTableDesktop)}>
        <table className={marketsTable}>
          <thead>
            <tr>
              <th className={cn(marketsTh, marketsThMarket)}>Market</th>
              <th className={marketsTh}>
                <SortHeader
                  label="Index price"
                  active={sortKey === "price"}
                  direction={sortDir}
                  onClick={() => toggleSort("price")}
                />
              </th>
              <th className={cn(marketsTh, marketsThHideMd)}>
                <SortHeader
                  label="Volume"
                  active={sortKey === "volume"}
                  direction={sortDir}
                  onClick={() => toggleSort("volume")}
                />
              </th>
              <th className={cn(marketsTh, marketsThHideLg)}>
                <SortHeader
                  label="Liquidity"
                  active={sortKey === "liquidity"}
                  direction={sortDir}
                  onClick={() => toggleSort("liquidity")}
                />
              </th>
              <th className={cn(marketsTh, marketsThHideSm)}>
                <SortHeader
                  label="Auto close"
                  active={sortKey === "expiry"}
                  direction={sortDir}
                  onClick={() => toggleSort("expiry")}
                />
              </th>
              <th className={cn(marketsTh, marketsThTrade)} aria-label="Trade actions" />
            </tr>
          </thead>
          <tbody>
            {pageMarkets.map((m) => {
              const range = rangeBoundsForRow(m);
              const side = m.isRange ? ("range" as const) : m.isUp ? ("up" as const) : ("down" as const);

              return (
                <tr key={m.id} className={marketsRow}>
                  <td className={cn(marketsTd, marketsTdMarket)}>
                    <div className={marketsMarketCell}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={marketsBookmark}
                        aria-label="Bookmark market"
                      >
                        <Bookmark className="h-3.5 w-3.5" />
                      </Button>
                      <AssetBadge asset={m.asset} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/predictions/$oracleId"
                          params={{ oracleId: m.oracleId }}
                          search={
                            m.isRange
                              ? {
                                  side: "range",
                                  lowerStrike: m.strikeRaw,
                                  upperStrike: m.higherStrikeRaw,
                                }
                              : { strike: m.strikeRaw, side }
                          }
                          className={cn(marketsMarketLink, "font-medium")}
                        >
                          {m.question}
                        </Link>
                        <span className={cn(leverageBadge, "mt-1")}>10X</span>
                      </div>
                    </div>
                  </td>
                  <td className={marketsTd}>
                    <div className={marketsPriceCell}>
                      <span className={marketsPriceValue}>
                        {formatPremiumOrPlaceholder(m.lastAskPremium)}
                      </span>
                    </div>
                  </td>
                  <td className={cn(marketsTd, marketsTdMono, marketsTdHideMd)}>
                    {formatCompactUsdOrPlaceholder(m.volume > 0 ? m.volume : null)}
                  </td>
                  <td className={cn(marketsTd, marketsTdMono, marketsTdHideLg)}>
                    {liquidityLabel}
                  </td>
                  <td className={cn(marketsTd, marketsTdMuted, marketsTdHideSm)}>
                    {m.expiry ? formatAutoClose(m.expiry) : "—"}
                  </td>
                  <td className={cn(marketsTd, marketsTdTrade)}>
                    <div className={marketsTradeActions}>
                      <MarketSideActions
                        oracleId={m.oracleId}
                        strikeRaw={m.strikeRaw}
                        rangeLower={range?.lower}
                        rangeUpper={range?.upper}
                        hideRangeOnMobile
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MarketCatalogPagination
        page={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={MARKETS_TABLE_PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
