import { useMemo } from "react";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";

export type DepositKeyTarget = {
  position: LeveragedPosition;
  key: MarketKeyArgs;
};

function positionToKey(position: LeveragedPosition): MarketKeyArgs {
  return {
    oracleId: position.oracle_id,
    expiryMs: position.expiry_ms,
    strike: position.strike,
    higherStrike: position.higher_strike,
    isUp: position.is_up,
    isRange: position.is_range,
  };
}

/** Unique market keys from position history for deposit targets. */
export function useDepositKeyTargets(positions: readonly LeveragedPosition[]) {
  return useMemo(() => {
    const byKey = new Map<string, DepositKeyTarget>();
    for (const position of positions) {
      const existing = byKey.get(position.position_key);
      const recency = position.closed_at_ms ?? position.opened_at_ms ?? 0;
      const existingRecency = existing
        ? (existing.position.closed_at_ms ?? existing.position.opened_at_ms ?? 0)
        : -1;
      if (!existing || recency >= existingRecency) {
        byKey.set(position.position_key, {
          position,
          key: positionToKey(position),
        });
      }
    }
    return [...byKey.values()];
  }, [positions]);
}
