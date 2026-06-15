import { pillToggleActive, pillToggleBtn, pillToggleGroup, pillToggleIdle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

export type FundsDestinationTab = "manager" | "positions";

interface Props {
  value: FundsDestinationTab;
  onChange: (value: FundsDestinationTab) => void;
  managerDisabled?: boolean;
  className?: string;
}

export function FundsDestinationTabs({
  value,
  onChange,
  managerDisabled,
  className,
}: Props) {
  return (
    <div
      className={cn(pillToggleGroup, "w-full", className)}
      role="tablist"
      aria-label="Funds destination"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "manager"}
        disabled={managerDisabled}
        className={cn(
          pillToggleBtn,
          "flex-1 text-center",
          value === "manager" ? pillToggleActive : pillToggleIdle,
          managerDisabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => onChange("manager")}
      >
        Predict manager
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "positions"}
        className={cn(
          pillToggleBtn,
          "flex-1 text-center",
          value === "positions" ? pillToggleActive : pillToggleIdle,
        )}
        onClick={() => onChange("positions")}
      >
        Positions
      </button>
    </div>
  );
}
