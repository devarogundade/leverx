import { useMemo } from "react";
import { useMarketCatalog } from "@/hooks/useIndexer";
import { useOracleSpotMap } from "@/hooks/useOracleSpotMap";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import {
  mergeOracleMarkets,
  type MarketCategory,
} from "@/lib/leverx/predict-oracle-markets";

export function useMergedMarkets(args: {
  category: MarketCategory;
  search?: string;
}) {
  const {
    data: oracles = [],
    isLoading: oraclesLoading,
    isError: oraclesError,
    isFetched: oraclesFetched,
  } = usePredictOracleRows();

  const { data: catalog = [], isFetched: catalogFetched } = useMarketCatalog({
    limit: 1000,
  });

  const spotOracleIds = useMemo(
    () => oracles.filter((o) => o.oracle_id).map((o) => o.oracle_id),
    [oracles],
  );

  const { data: spotMap } = useOracleSpotMap(spotOracleIds);

  const categoryCounts = useMemo(
    () => ({
      All: mergeOracleMarkets({
        oracles,
        catalog,
        spotByOracle: spotMap,
        category: "All",
      }).length,
      Live: mergeOracleMarkets({
        oracles,
        catalog,
        spotByOracle: spotMap,
        category: "Live",
      }).length,
      Closed: mergeOracleMarkets({
        oracles,
        catalog,
        spotByOracle: spotMap,
        category: "Closed",
      }).length,
    }),
    [oracles, catalog, spotMap],
  );

  const markets = useMemo(
    (): LeverxMarketRow[] =>
      mergeOracleMarkets({
        oracles,
        catalog,
        spotByOracle: spotMap,
        category: args.category,
        search: args.search,
      }),
    [oracles, catalog, spotMap, args.category, args.search],
  );

  return {
    markets,
    categoryCounts,
    oracles,
    catalog,
    loading: oraclesLoading && !oraclesFetched,
    offline: oraclesError,
    catalogReady: catalogFetched,
  };
}
