import { useMemo } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { CancelOrderTrigger } from "@/components/leverx/CancelOrderModal";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import { formatPremiumCents } from "@/lib/leverx/indexer-markets";
import type { LimitMintOrder } from "@/lib/leverx/indexer-client";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { assetLabelForOracleId } from "@/lib/predict/oracles";
import { scaleQuote } from "@/lib/predict/scaling";

interface Props {
  orders: readonly LimitMintOrder[];
  className?: string;
}

interface OrderRow {
  id: string;
  order: LimitMintOrder;
  asset: string;
  side: string;
}

export function LeverxLimitOrdersTable({ orders, className }: Props) {
  const { data: oracles = [] } = usePredictOracleRows();
  const rows: OrderRow[] = useMemo(
    () =>
      orders.map((order) => ({
        id: order.placed_event_digest,
        order,
        asset: assetLabelForOracleId(order.oracle_id, oracles),
        side: predictSideLabel[sideFromIsUp(order.is_up)],
      })),
    [orders, oracles],
  );

  const cols: Column<OrderRow>[] = [
    {
      key: "market",
      header: "Market",
      mobileEmphasis: true,
      cell: (r) => (
        <div>
          <p className="text-sm font-medium">{r.asset}</p>
          <p className="text-[11px] text-muted-foreground">{r.side}</p>
        </div>
      ),
    },
    {
      key: "limit",
      header: "Limit",
      align: "right",
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatPremiumCents(r.order.limit_premium_per_unit)}
        </span>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.order.quantity.toLocaleString()}
        </span>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {scaleQuote(r.order.margin_quote).toFixed(2)} dUSDC
        </span>
      ),
    },
    {
      key: "leverage",
      header: "Lev",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="font-mono text-sm">{(r.order.leverage_bps / 10_000).toFixed(1)}×</span>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.order.order_expires_ms
            ? new Date(r.order.order_expires_ms).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      hideOnMobile: true,
      cell: (r) => <span className="text-xs capitalize text-muted-foreground">{r.order.status}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        r.order.status === "open" ? <CancelOrderTrigger order={r.order} /> : null,
    },
  ];

  return (
    <div className={className}>
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}
