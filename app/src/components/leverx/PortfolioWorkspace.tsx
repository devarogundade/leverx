import { useState } from "react";
import { Inbox, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SurfaceSkeleton } from "@/components/ui/market-skeleton";
import { UnderlineTabs } from "@/components/leverx/UnderlineTabs";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { LeverxLimitOrdersTable } from "@/components/leverx/LeverxLimitOrdersTable";
import { LeverxPositionsTable } from "@/components/leverx/LeverxPositionsTable";
import { PortfolioAccountPanel } from "@/components/leverx/PortfolioAccountPanel";
import { usePositionsMarkToMarket } from "@/hooks/usePositionsMarkToMarket";
import type { LeveragedPosition, LimitMintOrder, UserProxy } from "@/lib/leverx/indexer-client";
import { leverxInfo } from "@/lib/leverx/info-copy";
import { tradeSurface } from "@/lib/leverx/tw";
import { ui } from "@/lib/copy";
import { cn } from "@/lib/utils";

const TABS = ["positions", "orders", "closed", "account"] as const;
type PortfolioTab = (typeof TABS)[number];

function tabLabel(tab: PortfolioTab, openCount: number, orderCount: number) {
  if (tab === "positions") return `Positions (${openCount})`;
  if (tab === "orders") return `Orders (${orderCount})`;
  if (tab === "closed") return "Closed";
  return "Account";
}

interface Props {
  openPositions: readonly LeveragedPosition[];
  closedPositions: readonly LeveragedPosition[];
  limitOrders: readonly LimitMintOrder[];
  account: UserProxy | null;
  owner: string;
  loading?: boolean;
  className?: string;
}

export function PortfolioWorkspace({
  openPositions,
  closedPositions,
  limitOrders,
  account,
  owner,
  loading,
  className,
}: Props) {
  const [tab, setTab] = useState<PortfolioTab>("positions");
  const { byPositionId, isRefreshing } = usePositionsMarkToMarket(openPositions);

  const tabOptions = TABS.map((value) => ({
    value,
    label:
      value === "account" ? (
        <span className="inline-flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Account
        </span>
      ) : (
        tabLabel(value, openPositions.length, limitOrders.length)
      ),
  }));

  return (
    <div className={cn(tradeSurface, className)}>
      <div className="px-3 pt-2 sm:px-4">
        <UnderlineTabs
          value={tab}
          onValueChange={(v) => setTab(v as PortfolioTab)}
          options={tabOptions}
          listClassName="stretch"
        />
      </div>

      <div className="p-3 sm:p-4">
        {tab === "positions" ? (
          loading && openPositions.length === 0 ? (
            <SurfaceSkeleton lines={5} />
          ) : openPositions.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={ui.emptyPositions}
              description={ui.emptyPositionsHint}
              compact
            />
          ) : (
            <LeverxPositionsTable
              positions={openPositions}
              markToMarket={byPositionId}
              isRefreshing={isRefreshing}
              owner={owner}
              showHeader={false}
            />
          )
        ) : null}

        {tab === "orders" ? (
          loading && limitOrders.length === 0 ? (
            <LoadingState label="Loading orders…" compact />
          ) : limitOrders.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No open orders"
              description="Limit orders waiting for a match will appear here."
              compact
            />
          ) : (
            <div className="space-y-3">
              <LabelWithInfo
                label="Open limit orders"
                info={leverxInfo.openOrders}
                labelClassName="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              />
              <LeverxLimitOrdersTable orders={limitOrders} />
            </div>
          )
        ) : null}

        {tab === "closed" ? (
          loading && closedPositions.length === 0 ? (
            <LoadingState label="Loading history…" compact />
          ) : closedPositions.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No closed trades"
              description="Closed and settled positions will appear here."
              compact
            />
          ) : (
            <div className="space-y-3">
              <LabelWithInfo
                label="Closed positions"
                info={leverxInfo.closedPositions}
                labelClassName="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              />
              <LeverxPositionsTable
                positions={closedPositions}
                markToMarket={new Map()}
                showHeader={false}
              />
            </div>
          )
        ) : null}

        {tab === "account" && account ? (
          <PortfolioAccountPanel account={account} owner={owner} positions={openPositions} />
        ) : null}

        {tab === "account" && !account ? (
          <EmptyState
            title="No trading account"
            description="Open a trade to create your LeverX account."
            compact
          />
        ) : null}
      </div>
    </div>
  );
}
