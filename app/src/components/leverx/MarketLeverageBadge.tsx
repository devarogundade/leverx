import { useIndexerProtocol } from "@/hooks/useIndexer";
import { resolveFinalWindowMs } from "@/lib/leverx/protocol";
import {
  formatLeverageBadge,
  leverageBadgeToneClass,
  maxLeverageForExpiry,
} from "@/lib/leverx/trade-limits";
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
  const maxLeverage = maxLeverageForExpiry(expiryMs ?? 0, finalWindowMs, now);
  const label = formatLeverageBadge(maxLeverage);

  return (
    <span
      className={cn(
        leverageBadge,
        leverageBadgeToneClass(maxLeverage),
        "mt-1",
        className,
      )}
    >
      {label}
    </span>
  );
}
