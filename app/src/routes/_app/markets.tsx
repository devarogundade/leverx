import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { PredictMarketsGrid } from "@/components/leverx/PredictMarketsGrid";
import { PredictMarketsTable } from "@/components/leverx/PredictMarketsTable";
import { useMergedMarkets } from "@/hooks/useMergedMarkets";
import { useIndexerProtocol, useIndexerVaultSummary } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import { formatCompactUsdOrPlaceholder } from "@/lib/leverx/placeholders";
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
import { loadMarketsRoute } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

const CATEGORIES = ["All", "Live", "Closed"] as const;

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
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Live");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const { markets, categoryCounts, loading, offline, catalogReady } = useMergedMarkets({
    category: category as MarketCategory,
    search,
  });

  const { data: protocol } = useIndexerProtocol();
  const { data: vaultSummary } = useIndexerVaultSummary(protocol?.vault_id ?? undefined);

  const liquidityLabel = (() => {
    const nav = vaultSummary?.snapshot?.nav;
    if (nav && nav > 0) return formatCompactUsdOrPlaceholder(scaleQuote(nav));
    if (!catalogReady) return "…";
    return formatCompactUsdOrPlaceholder(null);
  })();

  return (
    <section className={cn(pageSimple, "animate-page-in")}>
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

      <UnderlineTabs
        variant="plain"
        value={category}
        onValueChange={(v) => setCategory(v as (typeof CATEGORIES)[number])}
        options={CATEGORIES.map((cat) => ({
          value: cat,
          label: (
            <>
              {cat}
              {cat === "Live" && categoryCounts.Live > 0 ? (
                <span className={cn(pillCount, "ml-1")}>{categoryCounts.Live}</span>
              ) : null}
            </>
          ),
        }))}
      />

      <div className={cn(view === "list" && marketsCatalogRegion)}>
        {view === "grid" ? (
          <PredictMarketsGrid
            markets={markets}
            liquidityLabel={liquidityLabel}
            loading={loading}
            offline={offline}
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <PredictMarketsTable
                markets={markets}
                liquidityLabel={liquidityLabel}
                loading={loading}
                offline={offline}
              />
            </div>
            <div className="lg:hidden">
              <PredictMarketsGrid
                markets={markets}
                liquidityLabel={liquidityLabel}
                loading={loading}
                offline={offline}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
