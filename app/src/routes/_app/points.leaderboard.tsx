import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trophy } from "lucide-react";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/ui/empty-state";
import { usePointsLeaderboard } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
import type { LeaderboardEntry } from "@/lib/leverx/indexer-client";
import { formatCompactUsdOrPlaceholder } from "@/lib/leverx/placeholders";
import { scaleQuote } from "@/lib/predict/scaling";

export const Route = createFileRoute("/_app/points/leaderboard")({
  head: () => ({
    meta: [{ title: pageTitle("Leaderboard") }],
  }),
  component: LeaderboardPage,
});

function shortOwner(owner: string): string {
  if (owner.length <= 12) return owner;
  return `${owner.slice(0, 6)}…${owner.slice(-4)}`;
}

const columns: Column<LeaderboardEntry>[] = [
  {
    key: "rank",
    header: "Rank",
    mobileLabel: "Rank",
    mobileEmphasis: true,
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
    cell: (entry) => (
      <span className="font-mono">
        {formatCompactUsdOrPlaceholder(
          entry.volume_quote > 0 ? scaleQuote(entry.volume_quote) : null,
        )}
      </span>
    ),
  },
  {
    key: "trades",
    header: "Trades",
    align: "right",
    cell: (entry) => <span className="font-mono">{entry.trade_count}</span>,
  },
  {
    key: "points",
    header: "Points",
    align: "right",
    cell: (entry) => (
      <span className="font-mono font-medium">
        {Math.round(scaleQuote(entry.points)).toLocaleString()}
      </span>
    ),
  },
];

function LeaderboardPage() {
  const { data: entries = [], isLoading, isError } = usePointsLeaderboard(100);

  return (
    <section className="animate-page-in space-y-8">
      <Link
        to="/points"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked by indexed trading volume (LVX points = quote notional).
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rankings…</p>
      ) : isError || entries.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description="Trade leveraged Predict positions to appear on the volume leaderboard."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <DataTable columns={columns} rows={entries} rowKey={(entry) => entry.owner} />
        </div>
      )}
    </section>
  );
}
