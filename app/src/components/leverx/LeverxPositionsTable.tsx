import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/DataTable";
import { AssetBadge } from "@/components/AssetBadge";
import { PositionActionsTrigger } from "@/components/leverx/PositionActionsModal";
import { PredictSideLabel } from "@/components/leverx/PredictSideLabel";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import {
  closedEntryPremiumCents,
  formatHealthBps,
  formatPnlPct,
  formatPnlUsd,
  positionRowId,
  realizedPnlPct,
  realizedPnlUsd,
  type PositionMarkToMarket,
} from "@/lib/leverx/position-metrics";
import { predictSideFromBinary, type PredictSide } from "@/lib/predict/instruments";
import { scaleQuote } from "@/lib/predict/scaling";
import { ui } from "@/lib/copy";
import { QuoteAmount } from "@/components/leverx/QuoteAmount";
import { resolveLiquidationBps } from "@/lib/leverx/protocol";
import { formatQuantity } from "@/lib/leverx/format-quantity";
import { formatCountdownStopwatch } from "@/lib/leverx/trade-limits";
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
  side: PredictSide;
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
  return `${formatCountdownStopwatch(remaining)} left`;
}

function buildRows(
  positions: readonly LeveragedPosition[],
  markToMarket: Map<string, PositionMarkToMarket>,
  oracles: readonly { oracle_id: string; underlying_asset?: string; }[],
): PositionRow[] {
  return positions.map((position) => ({
    id: positionRowId(position),
    position,
    asset: assetLabelForOracleId(position.oracle_id, oracles),
    side: predictSideFromBinary({
      isUp: position.is_up,
      isRange: position.is_range,
    }),
    strikeLabel: formatStrike(position),
    mtm: markToMarket.get(positionRowId(position)),
  }));
}

function PnlCell({
  position,
  mtm,
  closed,
}: {
  position: LeveragedPosition;
  mtm?: PositionMarkToMarket;
  closed: boolean;
}) {
  if (closed) {
    const pnlUsd = realizedPnlUsd(position);
    if (pnlUsd == null) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    const tone =
      pnlUsd > 0 ? "text-success" : pnlUsd < 0 ? "text-destructive" : "text-muted-foreground";
    return (
      <div className={cn("text-right tabular-nums", tone)}>
        <div className="text-sm font-medium">{formatPnlUsd(pnlUsd)}</div>
        <div className="text-[11px] opacity-80">{formatPnlPct(realizedPnlPct(position))}</div>
      </div>
    );
  }
  if (!mtm?.isLive) {
    return <span className="text-sm text-muted-foreground">…</span>;
  }
  const tone =
    mtm.unrealizedPnlUsd > 0
      ? "text-success"
      : mtm.unrealizedPnlUsd < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className={cn("text-right tabular-nums", tone)}>
      <div className="text-sm font-medium">{formatPnlUsd(mtm.unrealizedPnlUsd)}</div>
      <div className="text-[11px] opacity-80">{formatPnlPct(mtm.unrealizedPnlPct)}</div>
    </div>
  );
}

function HealthCell({ mtm, closed }: { mtm?: PositionMarkToMarket; closed: boolean; }) {
  const { data: protocol } = useIndexerProtocol();
  const liquidationBps = resolveLiquidationBps(protocol);

  if (closed || mtm?.healthBps == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const healthPct = mtm.healthBps / 100;
  const liquidationPct = liquidationBps / 100;
  const barMaxPct = Math.max(healthPct, liquidationPct);
  const fillWidth = (healthPct / barMaxPct) * 100;
  const liquidationWidth = (liquidationPct / barMaxPct) * 100;
  const aboveLiquidationWidth = Math.max(0, fillWidth - liquidationWidth);

  const aboveTone =
    mtm.healthLabel === "healthy"
      ? "bg-success"
      : mtm.healthLabel === "margin_call"
        ? "bg-amber-500"
        : "bg-destructive";

  const belowLiquidationTone =
    mtm.healthLabel === "at_risk" ? "bg-destructive/70" : "bg-success/35";

  return (
    <div className="min-w-[5.5rem]">
      <div className="mb-1 flex items-center justify-end gap-1.5 text-sm font-medium tabular-nums">
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
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
        title={`Liquidation at ${liquidationPct.toFixed(1)}%`}
      >
        {healthPct >= liquidationPct ? (
          <>
            <div
              className={cn("absolute inset-y-0 left-0 rounded-l-full", belowLiquidationTone)}
              style={{ width: `${liquidationWidth}%` }}
            />
            {aboveLiquidationWidth > 0 ? (
              <div
                className={cn("absolute inset-y-0 rounded-r-full transition-all", aboveTone)}
                style={{ left: `${liquidationWidth}%`, width: `${aboveLiquidationWidth}%` }}
              />
            ) : null}
          </>
        ) : (
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full transition-all", aboveTone)}
            style={{ width: `${fillWidth}%` }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-foreground/55"
          style={{ left: `${Math.min(100, Math.max(0, liquidationWidth))}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function LiveDot({ active }: { active?: boolean; }) {
  if (!active) return null;
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success"
      title="Live mark"
    />
  );
}

function StatusCell({ status }: { status: string }) {
  const isOpen = status === "open";
  return (
    <span
      className={cn(
        "text-sm capitalize",
        isOpen ? "font-medium text-success" : "text-muted-foreground",
      )}
    >
      {status}
    </span>
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
              <p className="text-[11px]">
                <PredictSideLabel side={r.side} colored />
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      mobileLabel: "Status",
      cell: (r) => <StatusCell status={r.position.status} />,
    },
    {
      key: "strike",
      header: "Strike",
      mobileLabel: "Strike",
      cell: (r) => <span className="font-mono text-sm">{r.strikeLabel}</span>,
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      mobileLabel: "Qty",
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.position.open_quantity > 0 ? formatQuantity(r.position.open_quantity) : "—"}
        </span>
      ),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      hideOnMobile: true,
      cell: (r) => {
        const closed = r.position.status !== "open";
        const entryCents = closed
          ? closedEntryPremiumCents(r.position)
          : r.mtm?.entryPremiumCents;
        return (
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {entryCents != null ? `${entryCents.toFixed(1)}¢` : "—"}
          </span>
        );
      },
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
            <span className="text-sm text-muted-foreground">
              {r.position.realized_payout > 0 ? (
                <QuoteAmount amount={scaleQuote(r.position.realized_payout)} className="text-sm" />
              ) : (
                "—"
              )}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 font-mono text-sm tabular-nums">
            <LiveDot active={r.mtm?.isLive} />
            {r.mtm?.markBidCents != null ? `${r.mtm.markBidCents.toFixed(1)}¢` : "…"}
          </span>
        );
      },
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      mobileTrailing: true,
      cell: (r) => (
        <PnlCell
          position={r.position}
          mtm={r.mtm}
          closed={r.position.status !== "open"}
        />
      ),
    },
    {
      key: "margin",
      header: "Margin / Lev",
      align: "right",
      mobileLabel: "Margin",
      cell: (r) => (
        <>
          <div className="font-medium">
            <QuoteAmount amount={scaleQuote(r.position.margin_quote)} />
          </div>
          <div className="text-muted-foreground">
            {(r.position.leverage_bps / 10_000).toFixed(1)}×
            {r.position.borrow_quote > 0 ? (
              <>
                {" · "}
                <QuoteAmount
                  amount={scaleQuote(r.position.borrow_quote)}
                  digits={1}
                  className="inline-flex"
                />{" "}
                borrowed
              </>
            ) : (
              ""
            )}
          </div>
        </>
      ),
    },
    {
      key: "health",
      header: (
        <LabelWithInfo label="Health (est.)" labelClassName="text-inherit" info={leverxInfo.estimatedHealth} />
      ),
      align: "right",
      mobileLabel: "Health",
      cell: (r) => <HealthCell mtm={r.mtm} closed={r.position.status !== "open"} />,
    },
    {
      key: "expiry",
      header: "Expiry",
      align: "right",
      mobileLabel: "Expiry",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{formatExpiry(r.position.expiry_ms)}</span>
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
        ) : null,
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
