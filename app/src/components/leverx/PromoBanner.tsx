import overflowBg from "@/assets/overflow.png";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export function PromoBanner({ className }: { className?: string; }) {
  return (
    <div className={cn("overflow-season-banner", className)}>
      <img
        src={overflowBg}
        alt=""
        className="overflow-season-banner-image"
        aria-hidden
      />
      <div className="overflow-season-banner-overlay" aria-hidden />
      <div className="overflow-season-banner-inner">
        <div className="overflow-season-banner-copy">
          <span className="overflow-season-eyebrow">
            <Trophy className="h-3 w-3 shrink-0" aria-hidden />
            Sui Overflow Season
          </span>
          <h2 className="overflow-season-title">Earn LVX points</h2>
          <p className="overflow-season-desc">
            Trade with leverage on demo markets and climb the volume leaderboard.
          </p>
        </div>
        <Link to="/points" className="overflow-season-cta">
          View leaderboard
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
