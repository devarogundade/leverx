import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { pageSimple, pageSimpleTitle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/lib/brand";

const EARN = [
  "Trade leveraged positions on DeepBook Predict markets",
  "Hold positions longer to accumulate time-weighted points",
  "Provide liquidity to the LeverageVault pool",
  "Complete onboarding and refer new traders",
];

export const Route = createFileRoute("/_app/points")({
  head: () => ({
    meta: [{ title: pageTitle("Points") }],
  }),
  component: PointsPage,
});

function PointsPage() {
  return (
    <section className={cn(pageSimple, "mx-auto max-w-[var(--page-max)] animate-page-in")}>
      <div>
        <h1 className={pageSimpleTitle}>Points</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Earn LVX points by trading leveraged Predict positions.
        </p>
      </div>

      <EmptyState
        icon={Trophy}
        title="Points not available"
        description="Rewards and balances are not indexed on-chain yet. Season stats and your LVX balance will appear when a points API exists."
        action={
          <Link to="/points/leaderboard" className="btn-connect inline-flex items-center gap-2 text-sm">
            <Trophy className="h-4 w-4" />
            Leaderboard
          </Link>
        }
      />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">How to earn</h2>
        <ul className="space-y-2">
          {EARN.map((rule) => (
            <li key={rule} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-accent">•</span>
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
