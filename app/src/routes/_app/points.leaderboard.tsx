import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/_app/points/leaderboard")({
  head: () => ({
    meta: [{ title: pageTitle("Leaderboard") }],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  return (
    <section className="animate-page-in space-y-8">
      <Link
        to="/points"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="text-xl font-bold sm:text-2xl">Leaderboard</h1>

      <EmptyState
        icon={Trophy}
        title="Leaderboard not available"
        description="Points and rankings are not indexed on-chain. This view will appear when a rewards API exists."
      />
    </section>
  );
}
