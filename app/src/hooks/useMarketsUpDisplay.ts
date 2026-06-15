import { useMemo } from "react";
import { useMarketPremiumSparklines } from "@/hooks/useMarketPremiumSparklines";
import { useVisibleMarketAsks } from "@/hooks/useVisibleMarketAsks";
import { useVisibleOracleSpots } from "@/hooks/useVisibleOracleSpots";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import { gridUpDisplayRow } from "@/lib/leverx/predict-oracle-markets";

/** UP "above …" catalog rows with live spot, ATM strike, and on-chain asks (grid + list). */
export function useMarketsUpDisplay(sourceMarkets: readonly LeverxMarketRow[]) {
  const sourceByOracleId = useMemo(
    () => new Map(sourceMarkets.map((market) => [market.oracleId, market])),
    [sourceMarkets],
  );

  const { markets: withSpots } = useVisibleOracleSpots(sourceMarkets);
  const displayRows = useMemo(() => withSpots.map(gridUpDisplayRow), [withSpots]);
  const { markets: displayMarkets, isLoading: premiumLoading } =
    useVisibleMarketAsks(displayRows);
  const { seriesByMarketId } = useMarketPremiumSparklines(displayMarkets);

  return {
    sourceByOracleId,
    displayMarkets,
    premiumLoading,
    seriesByMarketId,
  };
}
