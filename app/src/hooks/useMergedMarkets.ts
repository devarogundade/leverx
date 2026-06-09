import { useMemo } from "react";
import { useMarketCatalog } from "@/hooks/useIndexer";
import { useOracleSpotMap } from "@/hooks/useOracleSpotMap";
import { usePredictOracleRows } from "@/hooks/usePredictOracles";
import type { LeverxMarketRow } from "@/lib/leverx/indexer-markets";
import {
  mergeOracleMarkets,
  type MarketCategory,
} from "@/lib/leverx/predict-oracle-markets";
import { isLiveOracleRow, isSettledOracleRow } from "@/lib/predict/oracles";

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

  const spotOracleIds = useMemo(() => {
    if (args.category === "Closed") {
      return oracles.filter((o) => isSettledOracleRow(o)).map((o) => o.oracle_id);
    }
    if (args.category === "All") {
      return oracles.filter((o) => o.oracle_id).map((o) => o.oracle_id);
    }
    return oracles.filter((o) => isLiveOracleRow(o)).map((o) => o.oracle_id);
  }, [oracles, args.category]);

  const { data: spotMap } = useOracleSpotMap(spotOracleIds);

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
    oracles,
    catalog,
    loading: oraclesLoading && !oraclesFetched,
    offline: oraclesError,
    catalogReady: catalogFetched,
  };
}
