import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPredictOracleRows,
  PREDICT_ORACLES_QUERY_KEY,
} from "@/lib/predict/oracle-cache";
import {
  resolveOracleNeighbors,
  type OracleNeighborOptions,
} from "@/lib/predict/oracle-navigation";
import { sortOracleRows } from "@/lib/predict/other-oracles";
import type { PredictOracleSummary } from "@/lib/predict/types";

type PredictOracleContextValue = {
  oracles: PredictOracleSummary[];
  data: PredictOracleSummary[];
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetched: boolean;
  error: Error | null;
  refetch: () => void;
  getNeighbors: (
    oracleId: string,
    options?: OracleNeighborOptions,
  ) => ReturnType<typeof resolveOracleNeighbors>;
};

const PredictOracleContext = createContext<PredictOracleContextValue | null>(null);

export function PredictOracleProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: PREDICT_ORACLES_QUERY_KEY,
    queryFn: getPredictOracleRows,
    staleTime: 300_000,
    retry: 2,
  });

  const oracles = useMemo(() => sortOracleRows(query.data ?? []), [query.data]);

  const value = useMemo(
    (): PredictOracleContextValue => ({
      oracles,
      data: oracles,
      isLoading: query.isLoading,
      isPending: query.isPending,
      isError: query.isError,
      isSuccess: query.isSuccess,
      isFetched: query.isFetched,
      error: query.error,
      refetch: () => {
        void query.refetch();
      },
      getNeighbors: (oracleId, options) => resolveOracleNeighbors(oracles, oracleId, options),
    }),
    [query, oracles],
  );

  return (
    <PredictOracleContext.Provider value={value}>{children}</PredictOracleContext.Provider>
  );
}

export function usePredictOracleContext(): PredictOracleContextValue {
  const ctx = useContext(PredictOracleContext);
  if (!ctx) {
    throw new Error("usePredictOracleContext must be used within PredictOracleProvider");
  }
  return ctx;
}
