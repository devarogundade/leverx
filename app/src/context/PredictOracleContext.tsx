import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import { appConfig } from "@/lib/config";
import {
  getPredictOracleRows,
  predictOraclesQueryKey,
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
  const { data: protocol } = useIndexerProtocol();
  const predictId = protocol?.predict_id?.trim() || appConfig.predictId;

  const query = useQuery({
    queryKey: predictOraclesQueryKey(predictId),
    queryFn: () => getPredictOracleRows(predictId),
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
      getNeighbors: (oracleId, options) =>
        resolveOracleNeighbors(oracles, oracleId, options),
    }),
    [oracles, query],
  );

  return (
    <PredictOracleContext.Provider value={value}>
      {children}
    </PredictOracleContext.Provider>
  );
}

export function usePredictOracles() {
  const ctx = useContext(PredictOracleContext);
  if (!ctx) {
    throw new Error("usePredictOracles must be used within PredictOracleProvider");
  }
  return ctx;
}
