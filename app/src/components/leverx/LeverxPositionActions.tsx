import { PositionActionsTrigger } from "@/components/leverx/PositionActionsModal";
import { CancelOrderTrigger } from "@/components/leverx/CancelOrderModal";
import type { LimitMintOrder, LeveragedPosition } from "@/lib/leverx/indexer-client";

interface CloseProps {
  position: LeveragedPosition;
  owner?: string;
  className?: string;
}

export function LeverxClosePositionButton({ position, className }: CloseProps) {
  if (position.status === "open") {
    return <PositionActionsTrigger position={position} className={className} />;
  }
  return null;
}

interface CancelProps {
  order: LimitMintOrder;
  owner?: string;
  className?: string;
}

export function LeverxCancelOrderButton({ order, className }: CancelProps) {
  return <CancelOrderTrigger order={order} className={className} />;
}
