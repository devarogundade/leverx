import { MarketSparkline } from "@/components/leverx/MarketSparkline";
import { AnimatedMarketPremium } from "@/components/ui/animated-numbers";
import { changePercentEndpoints } from "@/lib/charts/sparkline-path";
import {
  marketCardSparkline,
  marketCardSparklineFooter,
  marketsPriceCell,
  marketsPriceValue,
  marketsTableSparklineBand,
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
  /** Shorter sparkline for markets list/table density */
  compact?: boolean;
  className?: string;
}

export function MarketPremiumQuote({
  series,
  lastAskPremium,
  premiumLoading,
  quotePaused,
  variant = "inline",
  footer = false,
  compact = false,
  className,
}: Props) {
  const change = changePercentEndpoints(series);
  const positive = change >= 0;
  const showChange = series.length >= 2 && Math.abs(change) >= 0.05;

  if (variant === "band") {
    const bandClass = footer
      ? marketCardSparklineFooter
      : compact
        ? marketsTableSparklineBand
        : marketCardSparkline;

    return (
      <div className={cn(bandClass, className)}>
        <MarketSparkline
          series={series}
          height={compact ? 20 : 32}
          width="100%"
          edgeToEdge={footer}
          viewWidth={footer ? 240 : 104}
          viewHeight={compact ? 14 : 20}
        />
      </div>
    );
  }

  return (
    <div className={cn(marketsPriceCell, className)}>
      <MarketSparkline
        series={series}
        width={compact ? 28 : 52}
        height={compact ? 14 : 20}
        viewHeight={compact ? 14 : 20}
      />
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
