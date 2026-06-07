import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import type { MintQuote } from "@/lib/leverx/quotes";
import { formatPremiumCents } from "@/lib/leverx/indexer-markets";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { scaleQuote } from "@/lib/predict/scaling";
import { labelCaps } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  quote: MintQuote | null | undefined;
  isLoading?: boolean;
  className?: string;
}

export function TradeQuoteSummary({ quote, isLoading, className }: Props) {
  if (isLoading) {
    return (
      <div className={cn("rounded-md border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground", className)}>
        Quoting trade…
      </div>
    );
  }

  if (!quote) return null;

  return (
    <div className={cn("space-y-2 rounded-md border border-border/60 bg-card/40 p-3", className)}>
      <LabelWithInfo
        label="Pre-trade quote"
        labelClassName={labelCaps}
        info={leverxInfo.preTradeQuote}
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <LabelWithInfo label="Ask / unit" info={leverxInfo.askPerUnit} />
        <span className="font-mono text-right">
          {formatPremiumCents(Number(quote.marketAskPerUnit))}
        </span>
        <LabelWithInfo label="Mint cost" info={leverxInfo.mintCost} />
        <span className="font-mono text-right">{scaleQuote(Number(quote.mintCost)).toFixed(2)} USDC</span>
        <LabelWithInfo label="Vault borrow" info={leverxInfo.vaultBorrow} />
        <span className="font-mono text-right">{scaleQuote(Number(quote.borrowQuote)).toFixed(2)} USDC</span>
      </div>
    </div>
  );
}
