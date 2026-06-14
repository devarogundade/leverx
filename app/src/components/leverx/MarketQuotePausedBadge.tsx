import { leverageBadge } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export function MarketQuotePausedBadge({ className }: Props) {
  return (
    <span
      className={cn(
        leverageBadge,
        "border-amber-500/30 text-amber-300/90",
        className,
      )}
    >
      Paused
    </span>
  );
}
