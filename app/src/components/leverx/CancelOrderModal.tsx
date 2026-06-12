import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/leverx/ResponsiveModal";
import { useLeverxTransactions } from "@/hooks/useLeverxTransactions";
import type { LimitMintOrder } from "@/lib/leverx/indexer-client";
import { formatPremiumCents } from "@/lib/leverx/indexer-markets";
import { predictSideLabel, sideFromIsUp } from "@/lib/predict/instruments";
import { scaleQuote } from "@/lib/predict/scaling";
import { cn } from "@/lib/utils";
import { pillToggleBtn, pillToggleIdle } from "@/lib/leverx/tw";

interface Props {
  order: LimitMintOrder;
  className?: string;
}

export function CancelOrderTrigger({ order, className }: Props) {
  const { cancelLimitOrder, isProtocolReady, formatTxError } = useLeverxTransactions();
  const [open, setOpen] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const pending = cancelLimitOrder.isPending;
  const disabled = !isProtocolReady || order.status !== "open" || pending;
  const side = predictSideLabel[sideFromIsUp(order.is_up)];

  const confirm = () => {
    setTxError(null);
    cancelLimitOrder.mutate(order, {
      onError: (err) => setTxError(formatTxError(err)),
      onSuccess: () => setOpen(false),
    });
  };

  return (
    <>
      <button
        type="button"
        className={cn(pillToggleBtn, pillToggleIdle, "text-xs", className)}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Cancel
      </button>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Cancel open order"
        description={`${side} limit @ ${formatPremiumCents(order.limit_premium_per_unit)}`}
      >
        <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Quantity</dt>
          <dd className="font-mono text-right">{order.quantity.toLocaleString()}</dd>
          <dt className="text-muted-foreground">Margin reserved</dt>
          <dd className="font-mono text-right">
            {scaleQuote(order.margin_quote).toFixed(2)} dUSDC
          </dd>
          <dt className="text-muted-foreground">Leverage</dt>
          <dd className="font-mono text-right">{(order.leverage_bps / 10_000).toFixed(1)}×</dd>
        </dl>
        <p className="mb-4 text-xs text-muted-foreground">
          Cancelled orders release reserved margin back to your market balance.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={cn(pillToggleBtn, pillToggleIdle, "w-full sm:w-auto")}
            onClick={() => setOpen(false)}
          >
            Keep order
          </button>
          <button
            type="button"
            className={cn(
              pillToggleBtn,
              "w-full border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 sm:w-auto",
            )}
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Cancel order"}
          </button>
        </div>
        {txError ? <p className="mt-3 text-xs text-destructive">{txError}</p> : null}
      </ResponsiveModal>
    </>
  );
}
