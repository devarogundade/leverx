import { cn } from "@/lib/utils";
import {
  marketCard,
  marketCardBody,
  marketCardHeader,
  marketCardSparkline,
  marketsGrid,
  marketsRow,
  marketsTable,
  marketsTableScroll,
  marketsTableShell,
  marketsTd,
  marketsTh,
  pageBlock,
} from "@/lib/leverx/tw";

export function MarketCardSkeleton() {
  return (
    <article className={cn(marketCard, "pointer-events-none")} aria-hidden>
      <div className={marketCardBody}>
        <div className={marketCardHeader}>
          <div className="lx-skeleton h-8 w-8 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="lx-skeleton h-2.5 w-full rounded-sm" />
            <div className="lx-skeleton h-2.5 w-2/3 rounded-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="lx-skeleton h-9 rounded-md" />
          <div className="lx-skeleton h-9 rounded-md" />
        </div>
        <div className="lx-skeleton h-2.5 w-1/2 rounded-sm" />
      </div>
      <div className={cn(marketCardSparkline, "lx-skeleton")} />
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
      <div className={marketsTableScroll}>
        <table className={marketsTable} aria-hidden>
          <thead>
            <tr>
              {["Market", "Index price", "Volume", "Liquidity", "24hr Ch%", "Auto close", ""].map(
                (h) => (
                  <th key={h} className={marketsTh}>
                    <div className="lx-skeleton h-2.5 w-16 rounded-sm" />
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className={marketsRow}>
                <td className={marketsTd} colSpan={7}>
                  <div className="flex items-center gap-3">
                    <div className="lx-skeleton h-8 w-8 shrink-0 rounded-sm" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="lx-skeleton h-2.5 w-3/4 rounded-sm" />
                      <div className="lx-skeleton h-2.5 w-1/3 rounded-sm" />
                    </div>
                    <div className="lx-skeleton h-2.5 w-12 rounded-sm" />
                  </div>
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
          <div className="lx-skeleton h-2.5 w-24 rounded-sm" />
          <div className="lx-skeleton h-2.5 w-40 rounded-sm" />
        </div>
        <div className="lx-skeleton h-2.5 w-20 rounded-sm" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="lx-skeleton h-2.5 w-16 rounded-sm" />
            <div className="lx-skeleton h-2.5 w-24 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
