import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SurfaceSkeleton } from "@/components/ui/market-skeleton";
import { LeverxPositionsTable } from "@/components/leverx/LeverxPositionsTable";
import { usePositionsMarkToMarket } from "@/hooks/usePositionsMarkToMarket";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { isActiveOpenPosition } from "@/lib/leverx/position-metrics";
import { pageState } from "@/lib/leverx/tw";
import { ui } from "@/lib/copy";
import { cn } from "@/lib/utils";

interface Props {
  positions: readonly LeveragedPosition[];
  owner?: string;
  isLoading?: boolean;
  className?: string;
}

export function PredictManagerPortfolioPanel({
  positions,
  owner,
  isLoading,
  className,
}: Props) {
  const activePositions = positions.filter(isActiveOpenPosition);
  const { byPositionId, isRefreshing } = usePositionsMarkToMarket(activePositions);

  if (isLoading && activePositions.length === 0) {
    return <SurfaceSkeleton className={className} />;
  }

  if (activePositions.length === 0) {
    return (
      <div className={cn(pageState, "py-6", className)}>
        <EmptyState
          icon={Inbox}
          title={ui.emptyPositions}
          description={ui.emptyPositionsHint}
          compact
        />
      </div>
    );
  }

  return (
    <LeverxPositionsTable
      className={className}
      positions={activePositions}
      markToMarket={byPositionId}
      isRefreshing={isRefreshing}
      owner={owner}
    />
  );
}
