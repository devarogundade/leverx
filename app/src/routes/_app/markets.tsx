import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AnimatedCompactUsd } from "@/components/ui/animated-numbers";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, List, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { MarketsSortPopover } from "@/components/leverx/MarketsSortPopover";
import { PredictMarketsGrid } from "@/components/leverx/PredictMarketsGrid";
import { PredictMarketsTable } from "@/components/leverx/PredictMarketsTable";
import { PromoBanner } from "@/components/leverx/PromoBanner";
import { useMarketFavorites } from "@/context/MarketFavoritesContext";
import { useMergedMarkets } from "@/hooks/useMergedMarkets";
import { useVisibleMarketAsks } from "@/hooks/useVisibleMarketAsks";
import { useIndexerProtocol, useIndexerVaultSummary } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import { ui } from "@/lib/copy";
import type { MarketCategory } from "@/lib/leverx/predict-oracle-markets";
import { scaleQuote } from "@/lib/predict/scaling";
import {
  marketsCatalogRegion,
  pageSimple,
  pageSimpleActions,
  pageSimpleTitle,
  pageSimpleToolbar,
  pillCount,
  segTab,
  segTabActive,
  segTabsClass,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MARKET_SORT,
  sortMarketRows,
  type MarketSortId,
} from "@/lib/leverx/market-sort";
import { loadMarketsRoute } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";
import {
  readMarketListView,
  writeMarketListView,
  type MarketListView,
} from "@/lib/market-list-view";

const CATEGORIES = ["All", "Live", "Favorites", "Closed"] as const;
type MarketsTab = (typeof CATEGORIES)[number];

export const Route = createFileRoute("/_app/markets")({
  ...routePendingOptions,
  loader: ({ context }) => loadMarketsRoute(context.queryClient),
  head: () => ({
    meta: [
      { title: pageTitle("Markets") },
      {
        name: "description",
        content: "Browse live markets and open leveraged trades on price predictions.",
      },
    ],
  }),
  component: MarketsPage,
});

function MarketsPage() {
  const [category, setCategory] = useState<MarketsTab>("Live");
  const [search, setSearch] = useState("");
  const [view, setViewState] = useState<MarketListView>(readMarketListView);
  const setView = useCallback((next: MarketListView) => {
    setViewState(next);
    writeMarketListView(next);
  }, []);
  const [sort, setSort] = useState<MarketSortId>(DEFAULT_MARKET_SORT);
  const [notPausedOnly, setNotPausedOnly] = useState(false);
  const { favorites, favoriteCount } = useMarketFavorites();

  const catalogCategory: MarketCategory = category === "Favorites" ? "All" : category;

  const { markets: catalogMarkets, categoryCounts, loading, offline, catalogReady } =
    useMergedMarkets({
      category: catalogCategory,
      search,
    });

  const sortedMarkets = useMemo(() => {
    const filtered =
      category === "Favorites"
        ? catalogMarkets.filter((market) => favorites.has(market.id))
        : catalogMarkets;
    return sortMarketRows(filtered, sort);
  }, [catalogMarkets, category, favorites, sort]);

  const { markets: quotedMarkets, isLoading: quotedMarketsLoading } =
    useVisibleMarketAsks(notPausedOnly ? sortedMarkets : []);

  const markets = useMemo(() => {
    if (!notPausedOnly) return sortedMarkets;
    return quotedMarkets.filter((market) => !market.quotePaused);
  }, [notPausedOnly, sortedMarkets, quotedMarkets]);

  const emptyTitle = category === "Favorites" ? ui.emptyFavoriteMarkets : ui.emptyMarkets;
  const emptyDescription =
    category === "Favorites" ? ui.emptyFavoriteMarketsHint : ui.emptyMarketsHint;

  const { data: protocol } = useIndexerProtocol();
  const { data: vaultSummary } = useIndexerVaultSummary(protocol?.vault_id ?? undefined);

  const liquidityLabel: ReactNode = (() => {
    const nav = vaultSummary?.snapshot?.nav;
    if (nav && nav > 0) {
      return <AnimatedCompactUsd value={scaleQuote(nav)} />;
    }
    if (!catalogReady) return "…";
    return <AnimatedCompactUsd value={null} />;
  })();

  return (
    <section className={pageSimple}>
      <PromoBanner />

      <div className={pageSimpleToolbar}>
        <h1 className={pageSimpleTitle}>Markets</h1>
        <div className={pageSimpleActions}>
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets…"
              className="border-border bg-card pl-9"
            />
          </div>
          <div
            className={cn(segTabsClass("icon"), "hidden shrink-0 lg:inline-flex")}
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              className={cn(segTab, view === "list" && segTabActive)}
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(segTab, view === "grid" && segTabActive)}
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <UnderlineTabs
          variant="plain"
          className="min-w-0 flex-1"
          value={category}
          onValueChange={(v) => setCategory(v as MarketsTab)}
          options={CATEGORIES.map((cat) => ({
            value: cat,
            label: (
              <>
                {cat}
                {cat === "Live" && categoryCounts.Live > 0 ? (
                  <span className={cn(pillCount, "ml-1")}>{categoryCounts.Live}</span>
                ) : null}
                {cat === "Favorites" && favoriteCount > 0 ? (
                  <span className={cn(pillCount, "ml-1")}>{favoriteCount}</span>
                ) : null}
              </>
            ),
          }))}
        />
        <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={notPausedOnly}
              onCheckedChange={(checked) => setNotPausedOnly(checked === true)}
              aria-label="Show only markets that are not paused"
            />
            <span>Not paused</span>
          </label>
          <MarketsSortPopover value={sort} onChange={setSort} />
        </div>
      </div>

      <div className={cn(view === "list" && marketsCatalogRegion)}>
        {view === "grid" ? (
          <PredictMarketsGrid
            markets={markets}
            liquidityLabel={liquidityLabel}
            loading={loading}
            offline={offline}
            quotesEnriched={notPausedOnly}
            premiumLoading={notPausedOnly ? quotedMarketsLoading : undefined}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <PredictMarketsTable
                markets={markets}
                sort={sort}
                onSortChange={setSort}
                liquidityLabel={liquidityLabel}
                loading={loading}
                offline={offline}
                quotesEnriched={notPausedOnly}
                premiumLoading={notPausedOnly ? quotedMarketsLoading : undefined}
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
              />
            </div>
            <div className="lg:hidden">
              <PredictMarketsGrid
                markets={markets}
                liquidityLabel={liquidityLabel}
                loading={loading}
                offline={offline}
                quotesEnriched={notPausedOnly}
                premiumLoading={notPausedOnly ? quotedMarketsLoading : undefined}
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
