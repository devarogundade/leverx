import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { AssetBadge } from "@/components/AssetBadge";
import { PositionActionsTrigger } from "@/components/leverx/PositionActionsModal";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import {
  formatHealthBps,
  formatPnlPct,
  formatPnlUsd,
  positionRowId,
  type PositionMarkToMarket,
} from "@/lib/leverx/position-metrics";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { scaleQuote } from "@/lib/predict/scaling";
import { formatUsdc, ui } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { labelCaps } from "@/lib/leverx/tw";

interface Props {
  positions: readonly LeveragedPosition[];
  markToMarket: Map<string, PositionMarkToMarket>;
  isRefreshing?: boolean;
  owner?: string;
  compact?: boolean;
  showHeader?: boolean;
  className?: string;
}

interface PositionRow {
  id: string;
  position: LeveragedPosition;
  asset: string;
  side: string;
  strikeLabel: string;
  mtm: PositionMarkToMarket | undefined;
}

function formatStrike(position: LeveragedPosition): string {
  if (position.is_range && position.higher_strike > 0) {
    return `$${(position.strike / 1e9).toLocaleString()}–$${(position.higher_strike / 1e9).toLocaleString()}`;
  }
  if (position.strike > 0) {
    return `$${(position.strike / 1e9).toLocaleString()}`;
  }
  return "—";
}

function formatExpiry(expiryMs: number): string {
  if (!expiryMs) return "—";
  const remaining = expiryMs - Date.now();
  if (remaining <= 0) {
    return new Date(expiryMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return "<1h left";
}

function buildRows(
  positions: readonly LeveragedPosition[],
  markToMarket: Map<string, PositionMarkToMarket>,
  oracles: readonly { oracle_id: string; underlying_asset?: string }[],
): PositionRow[] {
  return positions.map((position) => ({
    id: positionRowId(position),
    position,
    asset: assetLabelForOracleId(position.oracle_id, oracles),
    side: predictSideLabel[sideFromIsUp(position.is_up)],
    strikeLabel: formatStrike(position),
    mtm: markToMarket.get(positionRowId(position)),
  }));
}

function PnlCell({ mtm, closed }: { mtm?: PositionMarkToMarket; closed: boolean }) {
  if (closed) return <span className="text-xs text-muted-foreground">Closed</span>;
  if (!mtm?.isLive) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  const tone =
    mtm.unrealizedPnlUsd > 0
      ? "text-success"
      : mtm.unrealizedPnlUsd < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className={cn("tabular-nums", tone)}>
      <div className="text-sm font-medium">{formatPnlUsd(mtm.unrealizedPnlUsd)}</div>
      <div className="text-[11px] opacity-80">{formatPnlPct(mtm.unrealizedPnlPct)}</div>
    </div>
  );
}

function HealthCell({ mtm, closed }: { mtm?: PositionMarkToMarket; closed: boolean }) {
  if (closed || mtm?.healthBps == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const pct = mtm.healthBps / 100;
  const barTone =
    mtm.healthLabel === "healthy"
      ? "bg-success"
      : mtm.healthLabel === "margin_call"
        ? "bg-amber-500"
        : "bg-destructive";

  return (
    <div className="min-w-[5.5rem]">
      <div className="mb-1 flex items-center justify-end gap-1.5 text-xs font-medium tabular-nums">
        <span
          className={cn(
            mtm.healthLabel === "healthy" && "text-success",
            mtm.healthLabel === "margin_call" && "text-amber-500",
            mtm.healthLabel === "at_risk" && "text-destructive",
          )}
        >
          {formatHealthBps(mtm.healthBps)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barTone)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function LiveDot({ active }: { active?: boolean }) {
  if (!active) return null;
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success"
      title="Live mark"
    />
  );
}

export function LeverxPositionsTable({
  positions,
  markToMarket,
  isRefreshing,
  owner,
  compact,
  showHeader = true,
  className,
}: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const rows = useMemo(
    () => buildRows(positions, markToMarket, oracles),
    [positions, markToMarket, oracles],
  );

  const cols: Column<PositionRow>[] = [
    {
      key: "market",
      header: "Market",
      mobileEmphasis: true,
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AssetBadge asset={r.asset} size="sm" />
            <div className="min-w-0">
              <Link
                to="/predictions/$oracleId"
                params={{ oracleId: r.position.oracle_id }}
                className="truncate text-sm font-medium hover:underline"
              >
                {r.asset}
              </Link>
              <p className="text-[11px] text-muted-foreground">{r.side}</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "strike",
      header: "Strike",
      mobileLabel: "Strike",
      cell: (r) => <span className="font-mono text-xs">{r.strikeLabel}</span>,
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      mobileLabel: "Qty",
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.position.open_quantity > 0 ? r.position.open_quantity.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {r.mtm?.entryPremiumCents != null ? `${r.mtm.entryPremiumCents.toFixed(1)}¢` : "—"}
        </span>
      ),
    },
    {
      key: "mark",
      header: (
        <span className="inline-flex items-center gap-1.5">
          Mark
          {isRefreshing ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          ) : null}
        </span>
      ),
      mobileLabel: "Mark",
      align: "right",
      cell: (r) => {
        const closed = r.position.status !== "open";
        if (closed) {
          return (
            <span className="font-mono text-xs text-muted-foreground">
              {r.position.realized_payout > 0
                ? formatUsdc(scaleQuote(r.position.realized_payout))
                : "—"}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs tabular-nums">
            <LiveDot active={r.mtm?.isLive} />
            {r.mtm?.markBidCents != null ? `${r.mtm.markBidCents.toFixed(1)}¢` : "…"}
          </span>
        );
      },
    },
    {
      key: "pnl",
      header: "Unrealized P&L",
      align: "right",
      mobileTrailing: true,
      cell: (r) => (
        <PnlCell mtm={r.mtm} closed={r.position.status !== "open"} />
      ),
    },
    {
      key: "margin",
      header: "Margin / Lev",
      align: "right",
      mobileLabel: "Margin",
      cell: (r) => (
        <div className="text-right text-xs tabular-nums">
          <div className="font-medium">{formatUsdc(scaleQuote(r.position.margin_quote))}</div>
          <div className="text-muted-foreground">
            {(r.position.leverage_bps / 10_000).toFixed(1)}×
            {r.position.borrow_quote > 0
              ? ` · ${scaleQuote(r.position.borrow_quote).toFixed(1)} borrowed`
              : ""}
          </div>
        </div>
      ),
    },
    {
      key: "health",
      header: (
        <LabelWithInfo label="Health (est.)" labelClassName="text-inherit" info={leverxInfo.estimatedHealth} />
      ),
      align: "right",
      hideOnMobile: true,
      cell: (r) => <HealthCell mtm={r.mtm} closed={r.position.status !== "open"} />,
    },
    {
      key: "expiry",
      header: "Expiry",
      align: "right",
      mobileLabel: "Expiry",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatExpiry(r.position.expiry_ms)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      mobileFooter: true,
      cell: (r) =>
        r.position.status === "open" ? (
          <PositionActionsTrigger position={r.position} />
        ) : (
          <span className="text-xs capitalize text-muted-foreground">{r.position.status}</span>
        ),
    },
  ];

  return (
    <div className={cn("space-y-2", className)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2 border-b border-border px-1 pb-2">
          <LabelWithInfo
            labelClassName={labelCaps}
            label={ui.predictManagerOpenPositions}
            info={leverxInfo.openPositionsTable}
          />
          {isRefreshing ? (
            <span className="text-[11px] text-muted-foreground">Updating marks…</span>
          ) : null}
        </div>
      ) : null}
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}
