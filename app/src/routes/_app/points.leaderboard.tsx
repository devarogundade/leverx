import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { usePointsLeaderboard } from "@/hooks/useIndexer";
import { pageTitle } from "@/lib/brand";
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Rank</th>
                <th className="px-4 py-3 font-medium">Trader</th>
                <th className="px-4 py-3 font-medium text-right">Volume</th>
                <th className="px-4 py-3 font-medium text-right">Trades</th>
                <th className="px-4 py-3 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.owner} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono">{entry.rank}</td>
                  <td className="px-4 py-3 font-mono" title={entry.owner}>
                    {shortOwner(entry.owner)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatCompactUsdOrPlaceholder(
                      entry.volume_quote > 0 ? scaleQuote(entry.volume_quote) : null,
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{entry.trade_count}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {Math.round(scaleQuote(entry.points)).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
