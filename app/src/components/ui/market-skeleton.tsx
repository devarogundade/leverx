import { cn } from "@/lib/utils";
import {
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
  pageBlock,
} from "@/lib/leverx/tw";

function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("lx-skeleton rounded-sm", className)} />;
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
    return <div className={cn(marketCardSparklineFooter, "lx-skeleton")} />;
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
          <SkeletonBar className="h-8 w-8 shrink-0" />
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
        <SkeletonBar className="h-8 w-8 shrink-0" />
        <SkeletonBar className="h-8 w-8 shrink-0" />
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
              <th className={cn(marketsTh, marketsThMarket)}>
                <SkeletonBar className="h-2.5 w-14" />
              </th>
              <th className={marketsTh}>
                <SkeletonBar className="h-2.5 w-16" />
              </th>
              <th className={cn(marketsTh, marketsThHideMd)}>
                <SkeletonBar className="h-2.5 w-14" />
              </th>
              <th className={cn(marketsTh, marketsThHideLg)}>
                <SkeletonBar className="h-2.5 w-16" />
              </th>
              <th className={cn(marketsTh, marketsThHideSm)}>
                <SkeletonBar className="h-2.5 w-16" />
              </th>
              <th className={cn(marketsTh, marketsThTrade)} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className={marketsRow}>
                <td className={cn(marketsTd, marketsTdMarket)}>
                  <div className="flex items-start gap-2.5">
                    <SkeletonBar className="h-8 w-8 shrink-0" />
                    <SkeletonBar className="h-8 w-8 shrink-0" />
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
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn(pageBlock, "space-y-3 py-4", className)} aria-hidden>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-2.5 w-24" />
          <SkeletonBar className="h-2.5 w-40" />
        </div>
        <SkeletonBar className="h-2.5 w-20" />
      </div>
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
