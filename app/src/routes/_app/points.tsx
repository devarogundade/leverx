import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/ui/empty-state";
import { PointsLeaderboardSkeleton } from "@/components/ui/market-skeleton";
import { usePointsLeaderboard } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import type { LeaderboardEntry } from "@/lib/leverx/indexer-client";
import { AnimatedCompactUsd, AnimatedCount } from "@/components/ui/animated-numbers";
import { pageSimple, pageSimpleTitle } from "@/lib/leverx/tw";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";
import { loadPointsRoute } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

function shortOwner(owner: string): string {
  if (owner.length <= 12) return owner;
  return `${owner.slice(0, 6)}…${owner.slice(-4)}`;
}

const columns: Column<LeaderboardEntry>[] = [
  {
    key: "rank",
    header: "Rank",
    mobileLabel: "Rank",
    cell: (entry) => <span className="font-mono font-semibold">#{entry.rank}</span>,
  },
  {
    key: "owner",
    header: "Trader",
    mobileEmphasis: true,
    cell: (entry) => (
      <span className="font-mono" title={entry.owner}>
        {shortOwner(entry.owner)}
      </span>
    ),
  },
  {
    key: "volume",
    header: "Volume",
    align: "right",
    mobileLabel: "Volume",
    cell: (entry) => (
      <AnimatedCompactUsd
        value={entry.volume_quote > 0 ? scaleQuote(entry.volume_quote) : null}
      />
    ),
  },
  {
    key: "trades",
    header: "Trades",
    align: "right",
    mobileLabel: "Trades",
    cell: (entry) => <AnimatedCount value={entry.trade_count} />,
  },
  {
    key: "points",
    header: "Points",
    align: "right",
    mobileTrailing: true,
    cell: (entry) => (
      <AnimatedCount value={Math.round(scaleQuote(entry.points))} className="font-medium" />
    ),
  },
];

export const Route = createFileRoute("/_app/points")({
  ...routePendingOptions,
  loader: ({ context }) => loadPointsRoute(context.queryClient),
  head: () => ({
    meta: [{ title: pageTitle("Points") }],
  }),
  component: PointsPage,
});

function PointsPage() {
  const { data: entries = [], isLoading, isError } = usePointsLeaderboard(100);

  return (
    <section className={cn(pageSimple, "mx-auto max-w-[var(--page-max)]")}>
      <div>
        <h1 className={pageSimpleTitle}>Points</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Leaderboard ranked by LeverX leveraged trading volume (LVX points = quote notional).
        </p>
      </div>

      {isLoading ? (
        <PointsLeaderboardSkeleton rows={10} />
      ) : isError || entries.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description="Open or close leveraged positions on LeverX to appear on the volume leaderboard."
        />
      ) : (
        <DataTable columns={columns} rows={entries} rowKey={(entry) => entry.owner} />
      )}
    </section>
  );
}
