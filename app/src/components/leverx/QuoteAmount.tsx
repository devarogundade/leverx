import type { ReactNode } from "react";
import { AssetBadge, type AssetBadgeSize } from "@/components/AssetBadge";
import { formatAmount } from "@/lib/copy";
import { isQuoteAssetSymbol } from "@/lib/asset-icons";
import { formatQuantity } from "@/lib/leverx/format-quantity";
import { DATA_PLACEHOLDER } from "@/lib/leverx/placeholders";
import { cn } from "@/lib/utils";

type QuoteAmountProps = {
  amount: number | null | undefined;
  symbol?: string;
  placeholder?: string;
  loading?: boolean;
  /** When true, amounts ≤ 0 render the placeholder (matches formatUsdcOrPlaceholder). */
  hideZero?: boolean;
  /** Compact K/M/B/T for balances and quantities — not for asset spot/strike prices. */
  compact?: boolean;
  digits?: number;
  className?: string;
  amountClassName?: string;
  iconSize?: AssetBadgeSize;
  iconClassName?: string;
  align?: "start" | "end";
};

function formatQuoteValue(amount: number, compact?: boolean, digits?: number): string {
  if (digits != null) return amount.toFixed(digits);
  if (compact) return formatQuantity(amount);
  return formatAmount(amount);
}

export function QuoteIcon({
  symbol = "DUSDC",
  size = "sm",
  className,
}: {
  symbol?: string;
  size?: AssetBadgeSize;
  className?: string;
}) {
  return (
    <AssetBadge
      asset={symbol}
      size={size}
      className={cn("h-4 w-4", className)}
    />
  );
}

export function QuoteAmount({
  amount,
  symbol = "DUSDC",
  placeholder = DATA_PLACEHOLDER,
  loading,
  hideZero,
  compact,
  digits,
  className,
  amountClassName,
  iconSize = "sm",
  iconClassName,
  align = "start",
}: QuoteAmountProps) {
  if (loading) {
    return <span className={className}>…</span>;
  }

  if (amount == null || !Number.isFinite(amount)) {
    return <span className={className}>{placeholder}</span>;
  }

  if (hideZero && amount <= 0) {
    return <span className={className}>{placeholder}</span>;
  }

  const sym = symbol.trim().toUpperCase();
  const text = formatQuoteValue(amount, compact, digits);

  if (!isQuoteAssetSymbol(sym)) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <span className={cn("font-mono tabular-nums", amountClassName)}>{text}</span>
        <span className="text-muted-foreground">{sym}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        align === "end" && "justify-end",
        className,
      )}
      aria-label={`${text} ${sym}`}
    >
      <span className={cn("font-mono tabular-nums", amountClassName)} aria-hidden>
        {text}
      </span>
      <QuoteIcon symbol={sym} size={iconSize} className={iconClassName} />
    </span>
  );
}

/** Inline amount + quote icon for mixed copy, e.g. "up to 12.50 [icon]". */
export function QuoteAmountInline({
  amount,
  prefix,
  suffix,
  digits = 2,
  className,
}: {
  amount: number;
  prefix?: ReactNode;
  suffix?: ReactNode;
  digits?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {prefix}
      <QuoteAmount amount={amount} digits={digits} />
      {suffix}
    </span>
  );
}
