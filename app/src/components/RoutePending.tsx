import { useRouterState } from "@tanstack/react-router";
import { LayoutGrid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import {
  MarketGridSkeleton,
  SurfaceSkeleton,
  TradeTerminalSkeleton,
} from "@/components/ui/market-skeleton";
import { ui } from "@/lib/copy";
import {
  pageSimple,
  pageSimpleActions,
  pageSimpleTitle,
  pageSimpleToolbar,
  segTab,
  segTabActive,
  segTabsClass,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

const MARKET_CATEGORIES = ["All", "Live", "Favorites", "Closed"] as const;

const SIMPLE_PAGE_HEADERS: Record<string, { title: string; hint?: string }> = {
  "/portfolio": { title: "Portfolio", hint: ui.portfolioHint },
  "/vault": { title: ui.vaultPageTitle, hint: ui.vaultPageHint },
  "/points": {
    title: "Points",
    hint: "Leaderboard ranked by LeverX leveraged trading volume (LVX points = quote notional).",
  },
  "/keeper": { title: ui.keeperPageTitle, hint: ui.keeperPageHint },
  "/guide": { title: "How LeverX works" },
};

export function RoutePending() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname.startsWith("/predictions/")) {
    const oracleId = pathname.match(/^\/predictions\/([^/]+)/)?.[1];
    return <TradeTerminalSkeleton oracleId={oracleId} />;
  }

  if (pathname === "/markets") {
    return (
      <section className={cn(pageSimple, "animate-page-in")}>
        <div className={pageSimpleToolbar}>
          <h1 className={pageSimpleTitle}>Markets</h1>
          <div className={pageSimpleActions}>
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                disabled
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
                className={cn(segTab, segTabActive)}
                disabled
                aria-label="Grid view"
                aria-pressed
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button type="button" className={segTab} disabled aria-label="List view">
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <UnderlineTabs
          variant="plain"
          className="pointer-events-none"
          value="Live"
          onValueChange={() => {}}
          options={MARKET_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
        />

        <MarketGridSkeleton count={6} />
      </section>
    );
  }

  const pageHeader = SIMPLE_PAGE_HEADERS[pathname];
  if (pageHeader) {
    return (
      <section className={cn(pageSimple, "mx-auto max-w-[var(--page-max)] animate-page-in")}>
        <div>
          <h1 className={pageSimpleTitle}>{pageHeader.title}</h1>
          {pageHeader.hint ? (
            <p className="mt-1 text-sm text-muted-foreground">{pageHeader.hint}</p>
          ) : null}
        </div>
        <SurfaceSkeleton lines={6} hideHeader />
      </section>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <LoadingState />
    </div>
  );
}
