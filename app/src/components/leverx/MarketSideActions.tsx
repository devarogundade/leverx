import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { predictSideLabel, type PredictSide } from "@/lib/predict/instruments";
import {
  marketSideAction,
  marketSideActionDown,
  marketSideActionRange,
  marketSideActionUp,
  marketSideActions,
  marketSideActionsPlain,
  marketSideActionsStretch,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  oracleId: string;
  className?: string;
  stretch?: boolean;
  plain?: boolean;
  hideRangeOnMobile?: boolean;
}

function SideLink({
  oracleId,
  side,
  className,
  children,
}: {
  oracleId: string;
  side: PredictSide;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="/predictions/$oracleId"
      params={{ oracleId }}
      state={{ predictSide: side }}
      className={className}
    >
      {children}
    </Link>
  );
}

export function MarketSideActions({
  oracleId,
  className,
  stretch = false,
  plain = false,
  hideRangeOnMobile = false,
}: Props) {
  return (
    <div
      className={cn(
        plain ? marketSideActionsPlain : marketSideActions,
        stretch && marketSideActionsStretch,
        className,
      )}
      role="group"
      aria-label="Trade side"
    >
      <SideLink
        oracleId={oracleId}
        side="up"
        className={cn(marketSideAction, marketSideActionUp)}
      >
        {predictSideLabel.up}
      </SideLink>
      <SideLink
        oracleId={oracleId}
        side="down"
        className={cn(marketSideAction, marketSideActionDown)}
      >
        {predictSideLabel.down}
      </SideLink>
      <SideLink
        oracleId={oracleId}
        side="range"
        className={cn(
          marketSideAction,
          marketSideActionRange,
          hideRangeOnMobile && "hidden sm:inline-flex",
        )}
      >
        {predictSideLabel.range}
      </SideLink>
    </div>
  );
}
