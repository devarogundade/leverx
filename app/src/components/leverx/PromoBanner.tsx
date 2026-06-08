import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";

export function PromoBanner() {
  return (
    <div className="hero-panel promo-banner relative items-center justify-center overflow-hidden">
      <div className="landing-grid-bg absolute inset-0 opacity-30" aria-hidden />
      <div className="promo-banner-glow absolute inset-0" aria-hidden />
      <div className="relative z-10 p-6">
        <span className="promo-banner-badge">
          <Trophy className="h-3 w-3" aria-hidden />
          Genesis season
        </span>
        <h3 className="mt-3 font-display text-xl font-bold leading-tight tracking-tight">
          Sui Overflow
          <br />
          Leaderboard
        </h3>
        <p className="mt-2 max-w-[220px] text-sm leading-relaxed text-muted-foreground">
          Earn points for trading on the demo leaderboard.
        </p>
        <Link to="/points" className="btn-connect mt-5 inline-flex text-sm">
          View Details
        </Link>
      </div>
    </div>
  );
}
