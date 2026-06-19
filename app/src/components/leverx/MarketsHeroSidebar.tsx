import overflowBg from "@/assets/overflow.png";
import aiBannerBg from "@/assets/ai-banner.png";
import { MarketsHeroPromoCard } from "@/components/leverx/MarketsHeroPromoCard";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function MarketsHeroSidebar({ className }: Props) {
  return (
    <aside className={cn("markets-hero-sidebar", className)}>
      <MarketsHeroPromoCard
        badge="Live"
        imageSrc={overflowBg}
        title="Sui Overflow Season"
        description="Earn LVX points by trading with leverage on demo markets and climb the volume leaderboard."
        ctaLabel="View leaderboard"
        to="/points"
      />
      <MarketsHeroPromoCard
        badge="Beta"
        imageSrc={aiBannerBg}
        title="Trade with AI"
        description="Jarvis scans markets and manages trades for you."
        ctaLabel="Get started"
        to="/jarvis"
        layout="compact"
      />
    </aside>
  );
}
