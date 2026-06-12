import { useMemo } from "react";
import { InfoPopover, LabelWithInfo } from "@/components/leverx/InfoPopover";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useIndexerOrderBook } from "@/hooks/useIndexer";
import { useLeverxMarketAsk } from "@/hooks/useLeverxMarketAsk";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { formatPremiumOrPlaceholder } from "@/lib/leverx/indexer-markets";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import { DATA_PLACEHOLDER } from "@/lib/leverx/placeholders";
import type { OrderBookLevel } from "@/lib/leverx/indexer-client";
import { PREDICT_QUOTE_REFERENCE_QUANTITY } from "@/lib/leverx/constants";
import { costFromPremiumPerUnit, premiumRawToCents } from "@/lib/leverx/trade-math";
import { predictSideLabel, type PredictSide } from "@/lib/predict/instruments";
import { scaleQuote } from "@/lib/predict/scaling";
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
  side: PredictSide;
  onSideChange: (side: PredictSide) => void;
  placeholder?: boolean;
  /** Natural height instead of filling the parent (mobile chart tab). */
  compact?: boolean;
}

const MAX_LEVELS = 8;

function formatSize(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatLevelNotionalUsd(price: number, size: number): string {
  if (price <= 0 || size <= 0) return DATA_PLACEHOLDER;
  const quoteAtoms = Number(costFromPremiumPerUnit(BigInt(price), BigInt(size)));
  const usd = scaleQuote(quoteAtoms);
  if (usd <= 0) return DATA_PLACEHOLDER;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
  return `$${usd.toFixed(usd >= 10 ? 0 : 2)}`;
}

function maxTotal(levels: OrderBookLevel[]): number {
  if (levels.length === 0) return 1;
  return Math.max(...levels.map((l) => l.total), 1);
}

function sideToMarketKey(args: {
  oracleId: string;
  expiryMs: number;
  strike: number;
  higherStrike: number;
  side: PredictSide;
}): MarketKeyArgs | undefined {
  if (args.expiryMs <= 0 || args.strike <= 0) return undefined;
  const isRange = args.side === "range";
  return {
    oracleId: args.oracleId,
    expiryMs: args.expiryMs,
    strike: args.strike,
    higherStrike: isRange ? args.higherStrike : 0,
    isUp: isRange ? true : args.side === "up",
    isRange,
  };
}

function OrderBookShell({
  side,
  onSideChange,
  bids,
  asks,
  askShare,
  bidShare,
  lastTradedLabel,
  spreadLabel,
  bidsEmpty,
  asksEmpty,
  compact = false,
}: {
  side: PredictSide;
  onSideChange: (side: PredictSide) => void;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  askShare: number;
  bidShare: number;
  lastTradedLabel: string;
  spreadLabel: string;
  bidsEmpty: boolean;
  asksEmpty: boolean;
  compact?: boolean;
}) {
  const bidMax = maxTotal(bids);
  const askMax = maxTotal(asks);

  return (
    <div
      className={cn(
        tradeSurface,
        "flex flex-col",
        compact ? "h-auto min-h-[240px]" : "h-full min-h-[280px] flex-1",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <LabelWithInfo
          label="Order book"
          labelClassName={labelCaps}
          info={leverxInfo.orderBook}
        />
        <div className="flex items-center gap-1.5">
          <div className={pillToggleGroup} role="group" aria-label="Outcome">
            {(["up", "down", "range"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  pillToggleBtn,
                  side === option ? pillToggleActive : pillToggleIdle,
                )}
                onClick={() => onSideChange(option)}
                aria-pressed={side === option}
              >
                {predictSideLabel[option]}
              </button>
            ))}
          </div>
          <InfoPopover side="bottom" align="end">
            {leverxInfo.orderBookSide}
          </InfoPopover>
        </div>
      </div>

      <div className={cn(orderbookSideHeader, "border-b border-border px-3 py-1.5")}>
        <span>Price</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Notional</span>
      </div>

      <div className={cn(compact ? "flex flex-col" : orderbookStack, "px-1")}>
        <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Asks · LP mint</span>
        </div>
        <div className={compact ? "flex flex-col" : orderbookStackSection}>
          <div className={cn(compact ? "flex flex-col" : orderbookStackRows, "justify-end")}>
            {asksEmpty ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No live LP mint quote
              </p>
            ) : (
              asks.map((row, i) => (
                <div key={`ask-${row.price}-${i}`} className={orderbookRow}>
                  <div
                    className={cn(orderbookRowDepth, "rounded-r-sm bg-destructive/20")}
                    style={{ width: `${(row.total / askMax) * 100}%`, right: 0, left: "auto" }}
                  />
                  <span className="relative font-mono tabular-nums text-destructive">
                    {formatPremiumOrPlaceholder(row.price)}
                  </span>
                  <span className="relative text-center text-xs text-muted-foreground" title="Vault mint">
                    LP
                  </span>
                  <span className="relative text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatLevelNotionalUsd(row.price, row.size)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={cn(orderbookMid, "border-y border-border bg-surface/50")}>
          <span>
            Last trade{" "}
            <span className="font-mono tabular-nums text-foreground">{lastTradedLabel}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1">
            <LabelWithInfo label="Spread" info={leverxInfo.spread} />
            <span className="font-mono tabular-nums text-foreground">{spreadLabel}</span>
          </span>
        </div>

        <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Bids · limit orders</span>
        </div>
        <div className={compact ? "flex flex-col" : orderbookStackSection}>
          <div className={cn(compact ? "flex flex-col" : orderbookStackRows)}>
            {bidsEmpty ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No resting limit bids
              </p>
            ) : (
              bids.slice(0, MAX_LEVELS).map((row, i) => (
                <div key={`bid-${row.price}-${i}`} className={orderbookRow}>
                  <div
                    className={cn(orderbookRowDepth, "rounded-l-sm bg-success/20")}
                    style={{ width: `${(row.total / bidMax) * 100}%` }}
                  />
                  <span className="relative font-mono tabular-nums text-success">
                    {formatPremiumOrPlaceholder(row.price)}
                  </span>
                  <span className="relative text-center font-mono text-xs tabular-nums text-muted-foreground">
                    {formatSize(row.size)}
                  </span>
                  <span className="relative text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatLevelNotionalUsd(row.price, row.size)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {!bidsEmpty || !asksEmpty ? (
        <div className="border-t border-border px-3 py-2">
          <div className={orderbookSentiment}>
            <span className="bg-destructive/60" style={{ width: `${askShare}%` }} />
            <span className="bg-success/60" style={{ width: `${bidShare}%` }} />
          </div>
          <div className={orderbookSentimentLabels}>
            <span>
              LP <span className="text-destructive">{askShare}%</span>
            </span>
            <span>
              <span className="text-success">{bidShare}%</span> Limits
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PredictOrderBook({
  oracleId,
  expiryMs,
  strike,
  higherStrike = 0,
  side,
  onSideChange,
  placeholder = false,
  compact = false,
}: Props) {
  const isRange = side === "range";
  const isUp = isRange ? true : side === "up";
  const marketKey = useMemo(
    () =>
      sideToMarketKey({
        oracleId,
        expiryMs,
        strike,
        higherStrike,
        side,
      }),
    [oracleId, expiryMs, strike, higherStrike, side],
  );

  const { data: book, isLoading } = useIndexerOrderBook({
    oracleId,
    expiryMs,
    strike,
    higherStrike,
    isUp,
    isRange,
    enabled: !placeholder && expiryMs > 0 && strike > 0,
  });

  const { data: liveAskRaw, isLoading: liveAskLoading } = useLeverxMarketAsk(
    placeholder ? undefined : marketKey,
  );

  const liveAsk =
    liveAskRaw != null && liveAskRaw > 0n ? Number(liveAskRaw) : null;

  const lpRefQty = Number(PREDICT_QUOTE_REFERENCE_QUANTITY);
  const displayAsks: OrderBookLevel[] = useMemo(() => {
    if (!liveAsk || liveAsk <= 0) return [];
    return [{ price: liveAsk, size: lpRefQty, total: lpRefQty }];
  }, [liveAsk, lpRefQty]);

  const bids = book?.bids ?? [];
  const displayBids = bids.slice(0, MAX_LEVELS);

  const bidSize = displayBids.reduce((sum, row) => sum + row.size, 0);
  const lpWeight = displayAsks.length > 0 ? lpRefQty : 0;
  const totalDepth = bidSize + lpWeight;
  const bidShare = totalDepth > 0 ? Math.round((bidSize / totalDepth) * 100) : 50;
  const askShare = 100 - bidShare;

  const bestBid = displayBids[0]?.price ?? null;
  const spreadLabel = useMemo(() => {
    if (bestBid != null && liveAsk != null && liveAsk > bestBid) {
      return `${(premiumRawToCents(BigInt(liveAsk)) - premiumRawToCents(BigInt(bestBid))).toFixed(1)}¢`;
    }
    if (book?.spread_bps != null && displayAsks.length > 0 && displayBids.length > 0) {
      return `${(book.spread_bps / 100).toFixed(1)}¢`;
    }
    return DATA_PLACEHOLDER;
  }, [bestBid, liveAsk, book?.spread_bps, displayAsks.length, displayBids.length]);

  const lastTraded =
    book?.last_traded_premium ??
    bestBid ??
    liveAsk ??
    0;

  if (!placeholder && isLoading && !book && liveAskLoading) {
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

  if (placeholder || expiryMs <= 0 || strike <= 0) {
    return (
      <div
        className={cn(
          tradeSurface,
          "flex min-h-[240px] items-center justify-center p-4",
          !compact && "min-h-[280px] flex-1",
        )}
      >
        <EmptyState
          title="Order book unavailable"
          description="Select a live market to view limit bids and the LP mint price."
          compact
        />
      </div>
    );
  }

  const bidsEmpty = displayBids.length === 0;
  const asksEmpty = displayAsks.length === 0;

  return (
    <OrderBookShell
      side={side}
      onSideChange={onSideChange}
      bids={displayBids}
      asks={displayAsks}
      askShare={askShare}
      bidShare={bidShare}
      lastTradedLabel={lastTraded > 0 ? formatPremiumOrPlaceholder(lastTraded) : DATA_PLACEHOLDER}
      spreadLabel={spreadLabel}
      bidsEmpty={bidsEmpty}
      asksEmpty={asksEmpty}
      compact={compact}
    />
  );
}
