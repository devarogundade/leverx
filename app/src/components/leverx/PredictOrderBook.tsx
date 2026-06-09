import { useState } from "react";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { LoadingState } from "@/components/ui/loading-state";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useIndexerOrderBook } from "@/hooks/useIndexer";
import { formatPremiumOrPlaceholder } from "@/lib/leverx/indexer-markets";
import { DATA_PLACEHOLDER } from "@/lib/leverx/placeholders";
import type { OrderBookLevel } from "@/lib/leverx/indexer-client";
import {
  labelCaps,
  orderbookMid,
  orderbookRow,
  orderbookRowDepth,
  orderbookSentiment,
  orderbookSentimentLabels,
  orderbookSideHeader,
  orderbookStack,
  orderbookStackRows,
  orderbookStackSection,
  pillToggleActive,
  pillToggleBtn,
  pillToggleGroup,
  pillToggleIdle,
  tradeSurface,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  oracleId: string;
  expiryMs: number;
  strike: number;
  higherStrike?: number;
  isUp?: boolean;
  isRange?: boolean;
  placeholder?: boolean;
  /** Natural height instead of filling the parent (mobile chart tab). */
  compact?: boolean;
}

const PLACEHOLDER_ROWS = 4;

function formatSize(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function maxTotal(levels: OrderBookLevel[]): number {
  if (levels.length === 0) return 1;
  return Math.max(...levels.map((l) => l.total), 1);
}

function OrderBookShell({
  bookSide,
  onBookSideChange,
  asks,
  bids,
  askShare,
  bidShare,
  lastTradedLabel,
  spreadLabel,
  muted = false,
  compact = false,
}: {
  bookSide: "long" | "short";
  onBookSideChange: (side: "long" | "short") => void;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  askShare: number;
  bidShare: number;
  lastTradedLabel: string;
  spreadLabel: string;
  muted?: boolean;
  compact?: boolean;
}) {
  const askMax = maxTotal(asks);
  const bidMax = maxTotal(bids);

  return (
    <div
      className={cn(
        tradeSurface,
        "flex flex-col",
        compact ? "h-auto min-h-[240px]" : "h-full min-h-[280px] flex-1",
        muted && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <LabelWithInfo
          label="Prices"
          labelClassName={labelCaps}
          info={leverxInfo.orderBook}
        />
        <div className="flex items-center gap-1.5">
          <div className={pillToggleGroup} role="group" aria-label="Price view">
            <button
              type="button"
              className={cn(pillToggleBtn, bookSide === "long" ? pillToggleActive : pillToggleIdle)}
              onClick={() => onBookSideChange("long")}
              aria-pressed={bookSide === "long"}
            >
              Up
            </button>
            <button
              type="button"
              className={cn(pillToggleBtn, bookSide === "short" ? pillToggleActive : pillToggleIdle)}
              onClick={() => onBookSideChange("short")}
              aria-pressed={bookSide === "short"}
            >
              Down
            </button>
          </div>
          <InfoPopover side="bottom" align="end">
            {leverxInfo.orderBookSide}
          </InfoPopover>
        </div>
      </div>

      <div className={cn(orderbookSideHeader, "border-b border-border px-3 py-1.5")}>
        <span>Price</span>
        <span className="text-center">Size</span>
        <span className="text-right">USD</span>
      </div>

      <div className={cn(compact ? "flex flex-col" : orderbookStack, "px-1")}>
        <div className={compact ? "flex flex-col" : orderbookStackSection}>
          <div className={cn(compact ? "flex flex-col" : orderbookStackRows, "justify-end")}>
            {asks.map((row, i) => (
              <div key={`ask-${i}`} className={orderbookRow}>
                <div
                  className={cn(orderbookRowDepth, "rounded-r-sm bg-destructive/20")}
                  style={{ width: `${(row.total / askMax) * 100}%`, right: 0, left: "auto" }}
                />
                <span className="relative text-destructive">
                  {row.price > 0 ? formatPremiumOrPlaceholder(row.price) : DATA_PLACEHOLDER}
                </span>
                <span className="relative text-center text-muted-foreground">
                  {row.size > 0 ? formatSize(row.size) : DATA_PLACEHOLDER}
                </span>
                <span className="relative text-right text-muted-foreground">
                  {row.size > 0 ? `$${((row.price / 1e9) * row.size).toFixed(0)}` : DATA_PLACEHOLDER}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(orderbookMid, "border-y border-border bg-surface/50")}>
          <span>
            Last price <span className="font-mono text-foreground">{lastTradedLabel}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1">
            <LabelWithInfo label="Gap" info={leverxInfo.spread} />
            <span className="font-mono text-foreground">{spreadLabel}</span>
          </span>
        </div>

        <div className={compact ? "flex flex-col" : orderbookStackSection}>
          <div className={compact ? "flex flex-col" : orderbookStackRows}>
            {bids.map((row, i) => (
              <div key={`bid-${i}`} className={orderbookRow}>
                <div
                  className={cn(orderbookRowDepth, "rounded-l-sm bg-success/20")}
                  style={{ width: `${(row.total / bidMax) * 100}%` }}
                />
                <span className="relative text-success">
                  {row.price > 0 ? formatPremiumOrPlaceholder(row.price) : DATA_PLACEHOLDER}
                </span>
                <span className="relative text-center text-muted-foreground">
                  {row.size > 0 ? formatSize(row.size) : DATA_PLACEHOLDER}
                </span>
                <span className="relative text-right text-muted-foreground">
                  {row.size > 0 ? `$${((row.price / 1e9) * row.size).toFixed(0)}` : DATA_PLACEHOLDER}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <div className={orderbookSentiment}>
          <span className="bg-destructive/60" style={{ width: `${askShare}%` }} />
          <span className="bg-success/60" style={{ width: `${bidShare}%` }} />
        </div>
        <div className={orderbookSentimentLabels}>
          <span>
            Ask <span className="text-destructive">{askShare}%</span>
          </span>
          <span>
            <span className="text-success">{bidShare}%</span> Bid
          </span>
        </div>
      </div>
    </div>
  );
}

function placeholderLevels(side: "ask" | "bid"): OrderBookLevel[] {
  return Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => ({
    price: 0,
    size: 0,
    total: PLACEHOLDER_ROWS - i,
  }));
}

export function PredictOrderBook({
  oracleId,
  expiryMs,
  strike,
  higherStrike = 0,
  isUp = true,
  isRange = false,
  placeholder = false,
  compact = false,
}: Props) {
  const [bookSide, setBookSide] = useState<"long" | "short">("long");
  const { data: book, isLoading } = useIndexerOrderBook({
    oracleId,
    expiryMs,
    strike,
    higherStrike,
    isUp,
    isRange,
    enabled: !placeholder && expiryMs > 0 && strike > 0,
  });

  if (!placeholder && isLoading && !book) {
    return (
      <div
        className={cn(
          tradeSurface,
          "flex min-h-[240px] items-center justify-center p-6",
          !compact && "min-h-[280px] flex-1",
        )}
      >
        <LoadingState label="Loading order book…" compact />
      </div>
    );
  }

  const empty = !book || (book.bids.length === 0 && book.asks.length === 0);
  if (placeholder || empty) {
    return (
      <OrderBookShell
        bookSide={bookSide}
        onBookSideChange={setBookSide}
        asks={placeholderLevels("ask")}
        bids={placeholderLevels("bid")}
        askShare={50}
        bidShare={50}
        lastTradedLabel={DATA_PLACEHOLDER}
        spreadLabel={DATA_PLACEHOLDER}
        muted
        compact={compact}
      />
    );
  }

  const asks = book.asks;
  const bids = book.bids;
  const spread =
    book.spread_bps != null
      ? `${(book.spread_bps / 100).toFixed(1)}¢`
      : asks.length && bids.length
        ? `${(((asks[asks.length - 1]!.price - bids[0]!.price) / 1e9) * 100).toFixed(1)}¢`
        : DATA_PLACEHOLDER;
  const lastTraded = book.last_traded_premium ?? bids[0]?.price ?? asks[asks.length - 1]?.price ?? 0;

  return (
    <OrderBookShell
      bookSide={bookSide}
      onBookSideChange={setBookSide}
      asks={asks}
      bids={bids}
      askShare={book.ask_share_pct}
      bidShare={book.bid_share_pct}
      lastTradedLabel={lastTraded > 0 ? formatPremiumOrPlaceholder(lastTraded) : DATA_PLACEHOLDER}
      spreadLabel={spread}
      compact={compact}
    />
  );
}
