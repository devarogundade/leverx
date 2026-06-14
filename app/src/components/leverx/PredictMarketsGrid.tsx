import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MarketGridSkeleton } from "@/components/ui/market-skeleton";
import { AssetBadge } from "@/components/AssetBadge";
import { MarketFavoriteButton } from "@/components/leverx/MarketFavoriteButton";
import { MarketPremiumQuote } from "@/components/leverx/MarketPremiumQuote";
import { MarketSideActions } from "@/components/leverx/MarketSideActions";
import { useMarketPremiumSparklines } from "@/hooks/useMarketPremiumSparklines";
import { useVisibleMarketAsks } from "@/hooks/useVisibleMarketAsks";
import { useVisibleOracleSpots } from "@/hooks/useVisibleOracleSpots";
import {
  MARKETS_GRID_PAGE_SIZE,
  MarketCatalogPagination,
  paginateSlice,
} from "@/components/leverx/MarketCatalogPagination";
import {
  formatPremiumOrPlaceholder,
  type LeverxMarketRow,
} from "@/lib/leverx/indexer-markets";
import { ui } from "@/lib/copy";
import {
  landingCtaSecondary,
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
import { formatAutoClose } from "@/lib/leverx/placeholders";
import { MarketLeverageBadge } from "@/components/leverx/MarketLeverageBadge";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

interface Props {
  markets: LeverxMarketRow[];
  liquidityLabel?: string;
  loading?: boolean;
  offline?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function PredictMarketsGrid({
  markets,
  liquidityLabel = "_",
  loading,
  offline,
  emptyTitle = ui.emptyMarkets,
  emptyDescription = ui.emptyMarketsHint,
}: Props) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [markets]);

  const { items: pageMarkets, page: currentPage, totalPages, totalItems } = useMemo(
    () => paginateSlice(markets, page, MARKETS_GRID_PAGE_SIZE),
    [markets, page],
  );
  const { markets: marketsWithAsks, isLoading: premiumLoading } =
    useVisibleMarketAsks(pageMarkets);
  const { markets: visibleMarkets } = useVisibleOracleSpots(marketsWithAsks);
  const { seriesByMarketId } = useMarketPremiumSparklines(visibleMarkets);
  const now = useNow(1000);

  if (loading) {
    return <MarketGridSkeleton />;
  }

  if (markets.length === 0 && !offline) {
    return (
      <div className={pageState}>
        <EmptyState
          icon={BarChart3}
          title={emptyTitle}
          description={emptyDescription}
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
        {visibleMarkets.map((m) => {
          const marketHref = {
            to: "/predictions/$oracleId" as const,
            params: { oracleId: m.oracleId },
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
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors hover:text-accent">
                      {m.question}
                    </p>
                    <MarketLeverageBadge expiryMs={m.expiry} now={now} />
                  </Link>
                  <Link
                    {...marketHref}
                    className={cn(marketCardInteractive, marketCardPrice, "no-underline")}
                  >
                    <div className={marketCardPriceValue}>
                      {premiumLoading ? "…" : formatPremiumOrPlaceholder(m.lastAskPremium)}
                    </div>
                  </Link>
                </div>

                <div className={marketCardActions}>
                  <MarketSideActions oracleId={m.oracleId} stretch className="w-full" />
                </div>

                <div className={marketCardMeta}>
                  <span>
                    {m.volume > 0 ? `$${Math.round(m.volume)}` : "_"} · {liquidityLabel}
                  </span>
                  <div className={cn(marketCardInteractive, "flex items-center gap-2")}>
                    <span>{m.expiry ? formatAutoClose(m.expiry) : "—"}</span>
                    <MarketFavoriteButton
                      marketId={m.id}
                      size="sm"
                      className="h-7 w-7 min-w-7 p-0"
                      iconClassName="h-3 w-3"
                    />
                  </div>
                </div>
              </div>

              <MarketPremiumQuote
                variant="band"
                footer
                series={seriesByMarketId.get(m.id) ?? []}
                lastAskPremium={m.lastAskPremium}
                premiumLoading={premiumLoading}
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
