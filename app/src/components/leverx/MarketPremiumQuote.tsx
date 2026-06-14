import { MarketSparkline } from "@/components/leverx/MarketSparkline";
import { AnimatedMarketPremium } from "@/components/ui/animated-numbers";
import { changePercentEndpoints } from "@/lib/charts/sparkline-path";
import {
  marketCardSparkline,
  marketCardSparklineFooter,
  marketsPriceCell,
  marketsPriceValue,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  series: readonly number[];
  lastAskPremium: number | null;
  premiumLoading?: boolean;
  quotePaused?: boolean;
  variant?: "inline" | "band";
  /** Band at card footer — full width, no background tint */
  footer?: boolean;
  className?: string;
}

export function MarketPremiumQuote({
  series,
  lastAskPremium,
  premiumLoading,
  quotePaused,
  variant = "inline",
  footer = false,
  className,
}: Props) {
  const change = changePercentEndpoints(series);
  const positive = change >= 0;
  const showChange = series.length >= 2 && Math.abs(change) >= 0.05;

  if (variant === "band") {
    return (
      <div
        className={cn(
          footer ? marketCardSparklineFooter : marketCardSparkline,
          className,
        )}
      >
        <MarketSparkline
          series={series}
          height={32}
          width="100%"
          edgeToEdge={footer}
          viewWidth={footer ? 240 : 104}
        />
      </div>
    );
  }

  return (
    <div className={cn(marketsPriceCell, className)}>
      <MarketSparkline series={series} width={52} height={20} />
      <AnimatedMarketPremium
        className={marketsPriceValue}
        premium={lastAskPremium}
        quotePaused={quotePaused}
        loading={premiumLoading}
      />
      {showChange ? (
        <span
          className={cn(
            "markets-change",
            positive ? "markets-change--up" : "markets-change--down",
          )}
        >
          {positive ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      ) : null}
    </div>
  );
}
