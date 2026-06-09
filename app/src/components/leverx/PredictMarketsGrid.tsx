import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MarketGridSkeleton } from "@/components/ui/market-skeleton";
import { AssetBadge } from "@/components/AssetBadge";
import { MarketPremiumQuote } from "@/components/leverx/MarketPremiumQuote";
import { MarketSideActions } from "@/components/leverx/MarketSideActions";
import { useMarketPremiumSparklines } from "@/hooks/useMarketPremiumSparklines";
import {
  MARKETS_GRID_PAGE_SIZE,
  MarketCatalogPagination,
  paginateSlice,
} from "@/components/leverx/MarketCatalogPagination";
import {
  formatPremiumOrPlaceholder,
  type LeverxMarketRow,
} from "@/lib/leverx/indexer-markets";
import { resolveRangeBounds } from "@/lib/leverx/predict-oracle-markets";
import { ui } from "@/lib/copy";
import {
  landingCtaSecondary,
  leverageBadge,
  marketCard,
  marketCardActions,
  marketCardBody,
  marketCardHeader,
  marketCardInteractive,
  marketCardMeta,
  marketCardOverlay,
  marketCardPrice,
  marketCardPriceValue,
  marketsGrid,
  pageState,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

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
  markets: LeverxMarketRow[];
  liquidityLabel?: string;
  loading?: boolean;
  offline?: boolean;
}

export function PredictMarketsGrid({
  markets,
  liquidityLabel = "_",
  loading,
  offline,
}: Props) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [markets.length]);

  const { items: pageMarkets, page: currentPage, totalPages, totalItems } = useMemo(
    () => paginateSlice(markets, page, MARKETS_GRID_PAGE_SIZE),
    [markets, page],
  );
  const { seriesByMarketId } = useMarketPremiumSparklines(pageMarkets);

  if (loading) {
    return <MarketGridSkeleton />;
  }

  if (markets.length === 0 && !offline) {
    return (
      <div className={pageState}>
        <EmptyState
          icon={BarChart3}
          title={ui.emptyMarkets}
          description={ui.emptyMarketsHint}
          action={
            <Link to="/guide" className={cn(landingCtaSecondary, "text-sm")}>
              Learn how markets work
            </Link>
          }
        />
      </div>
    );
  }

  if (markets.length === 0 && offline) {
    return <MarketGridSkeleton />;
  }

  return (
    <div className="flex flex-col">
      <div className={marketsGrid}>
        {pageMarkets.map((m) => {
          const range = resolveRangeBounds({
            oracleId: m.oracleId,
            catalogRows: markets,
            strikeRaw: m.strikeRaw,
            lowerStrikeRaw: m.isRange ? m.strikeRaw : undefined,
            upperStrikeRaw: m.isRange ? m.higherStrikeRaw : undefined,
            oracleSpot: m.spotPrice,
          });
          const side = m.isRange ? ("range" as const) : m.isUp ? ("up" as const) : ("down" as const);
          const marketHref = {
            to: "/predictions/$oracleId" as const,
            params: { oracleId: m.oracleId },
            search: m.isRange
              ? {
                  side: "range" as const,
                  lowerStrike: range?.lower ?? m.strikeRaw,
                  upperStrike: range?.upper ?? m.higherStrikeRaw,
                }
              : { strike: m.strikeRaw, side },
          };

          return (
            <article key={m.id} className={marketCard}>
              <Link
                {...marketHref}
                className={marketCardOverlay}
                aria-hidden
                tabIndex={-1}
              />
              <div className={marketCardBody}>
                <div className={marketCardHeader}>
                  <AssetBadge asset={m.asset} size="sm" />
                  <Link
                    {...marketHref}
                    className={cn(marketCardInteractive, "min-w-0 flex-1 no-underline")}
                  >
                    <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground transition-colors hover:text-accent">
                      {m.question}
                    </p>
                    <span className={cn(leverageBadge, "mt-1")}>10X</span>
                  </Link>
                  <Link
                    {...marketHref}
                    className={cn(marketCardInteractive, marketCardPrice, "no-underline")}
                  >
                    <div className={marketCardPriceValue}>
                      {formatPremiumOrPlaceholder(m.lastAskPremium)}
                    </div>
                  </Link>
                </div>

                <div className={marketCardActions}>
                  <MarketSideActions
                    oracleId={m.oracleId}
                    strikeRaw={m.strikeRaw}
                    rangeLower={range?.lower}
                    rangeUpper={range?.upper}
                    stretch
                    className="w-full"
                  />
                </div>

                <div className={marketCardMeta}>
                  <span>
                    {m.volume > 0 ? `$${Math.round(m.volume)}` : "_"} · {liquidityLabel}
                  </span>
                  <div className={cn(marketCardInteractive, "flex items-center gap-2")}>
                    <span>{m.expiry ? formatAutoClose(m.expiry) : "—"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 min-w-7 p-0 text-muted-foreground"
                      aria-label="Bookmark"
                    >
                      <Bookmark className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <MarketPremiumQuote
                variant="band"
                footer
                series={seriesByMarketId.get(m.id) ?? []}
                lastAskPremium={m.lastAskPremium}
              />
            </article>
          );
        })}
      </div>
      <MarketCatalogPagination
        page={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={MARKETS_GRID_PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
