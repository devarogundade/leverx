import { useMemo } from "react";
import { MarketsHeroSidebar } from "@/components/leverx/MarketsHeroSidebar";
import { TopMarketsSwiper } from "@/components/leverx/TopMarketsSwiper";
import { useMergedMarkets } from "@/hooks/useMergedMarkets";
import { pickTopOracleMarkets } from "@/lib/leverx/top-oracle-markets";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function MarketsHeroSection({ className }: Props) {
  const { markets, loading } = useMergedMarkets({ category: "Live" });
  const topMarkets = useMemo(() => pickTopOracleMarkets(markets), [markets]);

  return (
    <div className={cn("markets-hero-grid", className)}>
      <TopMarketsSwiper markets={topMarkets} loading={loading} />
      <MarketsHeroSidebar />
    </div>
  );
}
