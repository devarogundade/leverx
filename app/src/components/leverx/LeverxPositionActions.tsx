import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PositionRiskMenu } from "@/components/leverx/PositionRiskMenu";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import type { LimitMintOrder, LeveragedPosition } from "@/lib/leverx/indexer-client";
import { pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";

interface CloseProps {
  position: LeveragedPosition;
  owner?: string;
  className?: string;
}

export function LeverxClosePositionButton({ position, owner, className }: CloseProps) {
  if (position.status === "open") {
    return <PositionRiskMenu position={position} owner={owner} className={className} />;
  }
  return null;
}

interface CancelProps {
  order: LimitMintOrder;
  owner?: string;
  className?: string;
}

export function LeverxCancelOrderButton({ order, owner, className }: CancelProps) {
  const { cancelLimitOrder, isProtocolReady, formatTxError } = useLeverxTransactions();

  const pending = cancelLimitOrder.isPending;
  const disabled = !isProtocolReady || order.status !== "open" || pending;

  return (
    <button
      type="button"
      className={cn(pillToggleBtn, pillToggleIdle, "text-xs", className)}
      disabled={disabled}
      onClick={() => {
        cancelLimitOrder.mutate(order, {
          onError: (err) => {
            window.alert(formatTxError(err));
          },
        });
      }}
    >
      {pending ? (
        <>
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Cancelling…
        </>
      ) : (
        "Cancel"
      )}
    </button>
  );
}
