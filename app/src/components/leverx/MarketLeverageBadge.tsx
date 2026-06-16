import { useIndexerProtocol } from "@/hooks/useIndexer";
import { resolveFinalWindowMs } from "@/lib/leverx/protocol";
import { maxLeverageLabelForExpiry } from "@/lib/leverx/trade-limits";
import { leverageBadge } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  expiryMs?: number;
  now?: number;
  className?: string;
}

export function MarketLeverageBadge({ expiryMs, now, className }: Props) {
  const { data: protocol } = useIndexerProtocol();
  const finalWindowMs = resolveFinalWindowMs(protocol);
  const label = maxLeverageLabelForExpiry(expiryMs, finalWindowMs, now);
  const isReduced = label === "1X";
  const isMax = label === "10X";

  return (
    <span
      className={cn(
        leverageBadge,
        "mt-1",
        isMax &&
          "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
        isReduced &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {label}
    </span>
  );
}
