import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import type { MintQuote } from "@/lib/leverx/quotes";
import { formatPremiumCents } from "@/lib/leverx/indexer-markets";
import { isPremiumWithinPredictBounds } from "@/lib/leverx/trade-math";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { scaleQuote } from "@/lib/predict/scaling";
import { labelCaps } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  quote: MintQuote | null | undefined;
  isLoading?: boolean;
  isRefreshing?: boolean;
  className?: string;
}

export function TradeQuoteSummary({ quote, isLoading, isRefreshing, className }: Props) {
  if (!quote) {
    if (isLoading) {
      return (
        <div
          className={cn(
            "rounded-md border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground",
            className,
          )}
        >
          Calculating cost…
        </div>
      );
    }
    return null;
  }

  const premiumRaw = Number(quote.marketAskPerUnit);
  const outOfBounds = !isPremiumWithinPredictBounds(quote.marketAskPerUnit);

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border/60 bg-card/40 p-3 transition-opacity",
        isRefreshing && "opacity-80",
        className,
      )}
    >
      <LabelWithInfo
        label="Estimated cost"
        labelClassName={labelCaps}
        info={leverxInfo.preTradeQuote}
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <LabelWithInfo label="Per contract" info={leverxInfo.askPerUnit} />
        <span className={cn("font-mono text-right", outOfBounds && "text-amber-400")}>
          {formatPremiumCents(premiumRaw)}
        </span>
        <LabelWithInfo label="Total cost" info={leverxInfo.mintCost} />
        <span className="font-mono text-right">
          <QuoteAmount amount={scaleQuote(Number(quote.mintCost))} digits={2} align="end" />
        </span>
        {Number(quote.borrowQuote) > 0 ? (
          <>
            <LabelWithInfo label="Borrowed" info={leverxInfo.vaultBorrow} />
            <span className="font-mono text-right">
              <QuoteAmount amount={scaleQuote(Number(quote.borrowQuote))} digits={2} align="end" />
            </span>
          </>
        ) : null}
      </div>
      {outOfBounds ? (
        <p className="text-sm text-amber-200">
          This price cannot be traded on-chain right now (Predict allows 1¢–99¢ per contract).
        </p>
      ) : null}
    </div>
  );
}
