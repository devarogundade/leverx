import { Link } from "@tanstack/react-router";
import { predictSideLabel } from "@/lib/predict/instruments";
import {
  marketSideAction,
  marketSideActionDown,
  marketSideActionRange,
  marketSideActionUp,
  marketSideActions,
  marketSideActionsStretch,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  oracleId: string;
  strikeRaw: number;
  rangeLower?: number;
  rangeUpper?: number;
  className?: string;
  stretch?: boolean;
  hideRangeOnMobile?: boolean;
}

export function MarketSideActions({
  oracleId,
  strikeRaw,
  rangeLower,
  rangeUpper,
  className,
  stretch = false,
  hideRangeOnMobile = false,
}: Props) {
  const hasRange = rangeLower != null && rangeUpper != null && rangeLower > 0 && rangeUpper > 0;
  return (
    <div
      className={cn(marketSideActions, stretch && marketSideActionsStretch, className)}
      role="group"
      aria-label="Trade side"
    >
      <Link
        to="/predictions/$oracleId"
        params={{ oracleId }}
        search={{ strike: strikeRaw, side: "up" }}
        className={cn(marketSideAction, marketSideActionUp)}
      >
        {predictSideLabel.up}
      </Link>
      <Link
        to="/predictions/$oracleId"
        params={{ oracleId }}
        search={{ strike: strikeRaw, side: "down" }}
        className={cn(marketSideAction, marketSideActionDown)}
      >
        {predictSideLabel.down}
      </Link>
      {hasRange ? (
        <Link
          to="/predictions/$oracleId"
          params={{ oracleId }}
          search={{
            side: "range",
            lowerStrike: rangeLower,
            upperStrike: rangeUpper,
          }}
          className={cn(
            marketSideAction,
            marketSideActionRange,
            hideRangeOnMobile && "hidden sm:inline-flex",
          )}
        >
          {predictSideLabel.range}
        </Link>
      ) : null}
    </div>
  );
}
