import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { AssetBadge } from "@/components/AssetBadge";
import { FeaturedCommentsFeed } from "@/components/leverx/FeaturedCommentsFeed";
import { FeaturedMarketSpotChart } from "@/components/leverx/FeaturedMarketSpotChart";
import { MarketTradeLink } from "@/components/leverx/MarketTradeLink";
import { AnimatedAssetPrice, AnimatedCompactUsd } from "@/components/ui/animated-numbers";
import { useVisibleMarketAsks } from "@/hooks/useVisibleMarketAsks";
import { useNow } from "@/hooks/useNow";
import { formatAutoClose } from "@/lib/leverx/placeholders";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import { MarketTitle } from "@/components/leverx/MarketTitle";
import { formatAssetPriceUsd, formatStrikeUsdFromRaw } from "@/lib/leverx/format-asset-price";
import {
  featuredDownRow,
  formatFeaturedCountdown,
  payoutMultiplier,
} from "@/lib/leverx/featured-market-utils";
import { cn } from "@/lib/utils";

interface Props {
  market: LeverxMarketRow;
  sourceMarket: LeverxMarketRow;
  className?: string;
}

export function FeaturedMarketCard({
  market,
  sourceMarket,
  className,
}: Props) {
  const now = useNow(1000);
  const downRow = useMemo(() => featuredDownRow(market), [market]);
  const { markets: quoted } = useVisibleMarketAsks([market, downRow]);
  const upQuote = quoted[0] ?? market;
  const downQuote = quoted[1] ?? downRow;

  const spot = market.spotPrice ?? sourceMarket.spotPrice ?? null;
  const strikeUsd = market.strikeRaw > 0 ? market.strikeRaw / 1e9 : 0;
  const spotDelta =
    spot != null && strikeUsd > 0 ? spot - strikeUsd : null;
  const remainingMs = market.expiry > 0 ? Math.max(0, market.expiry - now) : 0;
  const countdown = remainingMs > 0 ? formatFeaturedCountdown(remainingMs) : null;

  const upMultiplier = payoutMultiplier(upQuote.lastAskPremium);
  const downMultiplier = payoutMultiplier(downQuote.lastAskPremium);

  return (
    <article className={cn("featured-market-card", className)}>
      <header className="featured-market-header">
        <div className="featured-market-header-main">
          <AssetBadge asset={market.asset} size="md" />
          <div className="min-w-0 flex-1">
            <MarketTradeLink
              market={market}
              side="up"
              className="featured-market-title-link"
            >
              <h2 className="featured-market-title">
                <MarketTitle />
              </h2>
            </MarketTradeLink>
            <p className="featured-market-subtitle">
              {market.expiry ? formatAutoClose(market.expiry) : "—"}
            </p>
          </div>
        </div>

        <div className="featured-market-prices">
          <div className="featured-market-price-stat">
            <span className="featured-market-price-label">Strike price</span>
            <span className="featured-market-price-value">
              {strikeUsd > 0 ? formatStrikeUsdFromRaw(market.strikeRaw) : "—"}
            </span>
          </div>
          <div className="featured-market-price-stat featured-market-price-stat--current">
            <span className="featured-market-price-label">Current price</span>
            <span className="featured-market-price-value featured-market-price-value--spot">
              {spotDelta != null && Math.abs(spotDelta) >= 0.01 ? (
                <span
                  className={cn(
                    "featured-market-price-delta",
                    spotDelta >= 0 ? "is-up" : "is-down",
                  )}
                >
                  {spotDelta >= 0 ? (
                    <TrendingUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3 w-3" aria-hidden />
                  )}
                  {spotDelta >= 0 ? "+" : "-"}
                  {formatAssetPriceUsd(Math.abs(spotDelta))}
                </span>
              ) : null}
              <AnimatedAssetPrice value={spot} />
            </span>
          </div>
        </div>

        {countdown ? (
          <p className="featured-market-countdown" role="timer" aria-live="polite">
            Ends in <span>{countdown}</span>
          </p>
        ) : <p className="featured-market-countdown" role="timer" aria-live="polite">
          Ended
        </p>}
      </header>

      <div className="featured-market-content">
        <div className="featured-market-left">
          <div className="featured-market-bets">
            <MarketTradeLink
              market={sourceMarket}
              side="up"
              className="featured-market-bet featured-market-bet--up"
            >
              <span>UP</span>
              <span>{upMultiplier ?? "—"}</span>
            </MarketTradeLink>
            <MarketTradeLink
              market={sourceMarket}
              side="down"
              className="featured-market-bet featured-market-bet--down"
            >
              <span>DOWN</span>
              <span>{downMultiplier ?? "—"}</span>
            </MarketTradeLink>
          </div>

          <FeaturedCommentsFeed oracleId={market.oracleId} />
        </div>

        <FeaturedMarketSpotChart
          oracleId={market.oracleId}
          asset={market.asset}
          strikeUsd={strikeUsd}
          oracleRow={{
            oracle_id: market.oracleId,
            status: market.oracleStatus ?? market.status,
            expiry: market.expiry,
            settled_at: null,
          }}
        />
      </div>

      <footer className="featured-market-footer">
        <span className="featured-market-volume">
          <AnimatedCompactUsd value={sourceMarket.volume > 0 ? sourceMarket.volume : null} /> Vol
        </span>
        <span className="featured-market-brand">LeverX</span>
      </footer>
    </article>
  );
}
