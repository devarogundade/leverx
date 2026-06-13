import { LEVERAGED_MINT_WINDOW_MS } from "@/lib/leverx/constants";
import { maxLeverageLabelForExpiry } from "@/lib/leverx/trade-limits";
import { leverageBadge } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  expiryMs?: number;
  now?: number;
  className?: string;
}

export function MarketLeverageBadge({ expiryMs, now, className }: Props) {
  const label = maxLeverageLabelForExpiry(expiryMs, LEVERAGED_MINT_WINDOW_MS, now);
  const isReduced = label === "1X";

  return (
    <span
      className={cn(
        leverageBadge,
        "mt-1",
        isReduced && "border-amber-500/30 text-amber-300/90",
        className,
      )}
    >
      {label}
    </span>
  );
}
