import { Inbox } from "lucide-react";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/ui/empty-state";
import { SurfaceSkeleton } from "@/components/ui/market-skeleton";
import { AssetBadge } from "@/components/AssetBadge";
import { formatUsdc, ui } from "@/lib/copy";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { scaleQuote } from "@/lib/predict/scaling";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { PositionRiskMenu } from "@/components/leverx/PositionRiskMenu";
import { leverxInfo } from "@/lib/leverx/info-copy";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { labelCaps, pageState } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  positions: readonly LeveragedPosition[];
  owner?: string;
  isLoading?: boolean;
  className?: string;
}

interface PositionRow {
  id: string;
  position: LeveragedPosition;
  underlying: string;
  direction: string;
  strike: number;
  openQty: number;
  margin: number;
  expiry: string;
  status: string;
}

function oracleAssetLabel(oracleId: string): string {
  return oracleId.slice(2, 6).toUpperCase() || "MKT";
}

function buildPositionRows(positions: readonly LeveragedPosition[]): PositionRow[] {
  return positions.map((p) => ({
    id: `${p.position_key}-${p.account_id}`,
    position: p,
    underlying: oracleAssetLabel(p.oracle_id),
    direction: predictSideLabel[sideFromIsUp(p.is_up)],
    strike: p.strike / 1e9,
    openQty: p.open_quantity,
    margin: scaleQuote(p.margin_quote),
    expiry: p.expiry_ms
      ? new Date(p.expiry_ms).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—",
    status: p.status,
  }));
}

export function PredictManagerPortfolioPanel({
  positions,
  owner,
  isLoading,
  className,
}: Props) {
  if (isLoading && positions.length === 0) {
    return <SurfaceSkeleton className={className} />;
  }

  const positionRows = buildPositionRows(positions);

  const cols: Column<PositionRow>[] = [
    {
      key: "asset",
      header: "Market",
      mobileEmphasis: true,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <AssetBadge asset={r.underlying} size="sm" />
          <span className="text-sm font-medium">{r.underlying}</span>
        </div>
      ),
    },
    {
      key: "direction",
      header: "Side",
      hideOnMobile: true,
      cell: (r) => <span className="text-sm text-muted-foreground">{r.direction}</span>,
    },
    {
      key: "strike",
      header: "Strike",
      align: "right",
      cell: (r) => (
        <span className="text-sm font-medium">
          {r.strike > 0 ? `$${r.strike.toLocaleString()}` : "—"}
        </span>
      ),
    },
    {
      key: "openQty",
      header: "Open qty",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-sm">{r.openQty > 0 ? r.openQty.toLocaleString() : "—"}</span>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      cell: (r) => <span className="text-sm font-medium">{formatUsdc(r.margin)}</span>,
    },
    {
      key: "expiry",
      header: "Term",
      hideOnMobile: true,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.expiry}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        r.status === "open" ? (
          <PositionRiskMenu position={r.position} owner={owner} />
        ) : null,
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {positionRows.length > 0 ? (
        <div className="space-y-2">
          <LabelWithInfo
            className={cn(labelCaps, "px-1")}
            label={ui.predictManagerOpenPositions}
            labelClassName={labelCaps}
            info={leverxInfo.openPositionsTable}
          />
          <DataTable columns={cols} rows={positionRows} rowKey={(r) => r.id} />
        </div>
      ) : (
        <div className={cn(pageState, "py-6")}>
          <EmptyState
            icon={Inbox}
            title={ui.emptyPositions}
            description={ui.emptyPositionsHint}
            compact
          />
        </div>
      )}
    </div>
  );
}
