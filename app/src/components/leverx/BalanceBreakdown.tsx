import { Link } from "@tanstack/react-router";
import { ChevronDown, Wallet } from "lucide-react";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts, useIndexerPositions } from "@/hooks/useIndexer";
import { ui } from "@/lib/copy";
import {
  DATA_PLACEHOLDER,
  formatUsdcBalance,
  formatUsdcPill,
} from "@/lib/leverx/placeholders";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

function BalanceRow({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[0.8125rem] text-muted-foreground">
      {info ? <LabelWithInfo label={label} info={info} /> : <span>{label}</span>}
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function BalanceBreakdown({ className }: Props) {
  const { address, isWalletConnected } = useWallet();
  const {
    data: accounts = [],
    isLoading: accountsLoading,
    isFetched: accountsFetched,
  } = useIndexerAccounts(address ?? undefined);
  const {
    data: positions = [],
    isLoading: positionsLoading,
    isFetched: positionsFetched,
  } = useIndexerPositions(address ?? undefined, { status: "open" });

  const ready =
    isWalletConnected && accountsFetched && positionsFetched && !accountsLoading && !positionsLoading;

  const margin = ready
    ? positions.reduce((sum, p) => sum + scaleQuote(p.margin_quote), 0)
    : null;
  const borrowed = ready ? scaleQuote(accounts[0]?.borrowed_quote ?? 0) : null;
  const positionCount = ready ? positions.length : null;

  const pillLabel = !isWalletConnected
    ? DATA_PLACEHOLDER
    : formatUsdcPill(margin, ready);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("header-balance-pill", className)}
          aria-label="Trading balance breakdown"
        >
          <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="max-w-[4.5rem] truncate sm:max-w-none">{pillLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="balance-breakdown w-56 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <LabelWithInfo
            label={ui.balanceTotal}
            labelClassName="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            info={leverxInfo.balanceTotal}
          />
          <p className="balance-breakdown-total mt-1">
            {formatUsdcBalance(margin, ready && isWalletConnected)}
          </p>
        </div>

        <div className="px-3 py-1">
          {!isWalletConnected ? (
            <p className="py-3 text-sm text-muted-foreground">{ui.balanceConnectHint}</p>
          ) : (
            <>
              <BalanceRow
                label="Margin"
                info={leverxInfo.balanceMargin}
                value={formatUsdcBalance(margin, ready)}
              />
              <BalanceRow
                label="Borrowed"
                info={leverxInfo.balanceBorrowed}
                value={formatUsdcBalance(borrowed, ready)}
              />
              <BalanceRow
                label="Positions"
                info={leverxInfo.balancePositions}
                value={
                  !ready
                    ? "…"
                    : positionCount == null
                      ? DATA_PLACEHOLDER
                      : String(positionCount)
                }
              />
            </>
          )}
        </div>

        {isWalletConnected ? (
          <div className="border-t border-border px-3 py-2">
            <Link
              to="/portfolio"
              className="text-xs font-medium text-accent hover:underline"
            >
              View portfolio →
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
