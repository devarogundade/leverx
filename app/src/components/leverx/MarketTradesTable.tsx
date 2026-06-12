import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { DataTable, type Column } from "@/components/DataTable";
import { formatPremiumCents } from "@/lib/leverx/indexer-markets";
import type { GlobalMarketTrade } from "@/lib/leverx/indexer-client";
import { cn } from "@/lib/utils";

interface Props {
  trades: readonly GlobalMarketTrade[];
  limit?: number;
  className?: string;
}

interface TradeRow {
  id: string;
  trade: GlobalMarketTrade;
}

function formatTradeTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function tradePrice(trade: GlobalMarketTrade): string {
  if (trade.ask_price) return formatPremiumCents(trade.ask_price);
  if (trade.bid_price) return formatPremiumCents(trade.bid_price);
  return "—";
}

export function MarketTradesTable({ trades, limit = 12, className }: Props) {
  const rows: TradeRow[] = trades.slice(0, limit).map((trade) => ({
    id: trade.event_digest,
    trade,
  }));

  const cols: Column<TradeRow>[] = [
    {
      key: "side",
      header: "Side",
      mobileEmphasis: true,
      cell: (r) => {
        const t = r.trade;
        return (
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
            {t.trade_side === "mint" ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <span className={cn(t.is_up ? "text-success" : "text-destructive")}>
              {t.trade_side === "mint" ? "OPEN" : "CLOSE"} {t.is_up ? "UP" : "DOWN"}
            </span>
          </span>
        );
      },
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      mobileTrailing: true,
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">{tradePrice(r.trade)}</span>
      ),
    },
    {
      key: "time",
      header: "Time",
      mobileLabel: "Time",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatTradeTime(r.trade.timestamp_ms)}
        </span>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.trade.quantity.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className={className}>
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}
