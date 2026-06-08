import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getPredictOracleRows,
  PREDICT_ORACLES_QUERY_KEY,
} from "@/lib/predict/oracle-cache";
import { resolveOracleNeighbors } from "@/lib/predict/oracle-navigation";
import { sortOracleRows } from "@/lib/predict/other-oracles";
import type { PredictOracleSummary } from "@/lib/predict/types";

type PredictOracleContextValue = UseQueryResult<PredictOracleSummary[], Error> & {
  oracles: PredictOracleSummary[];
  getNeighbors: (oracleId: string) => ReturnType<typeof resolveOracleNeighbors>;
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
      ...query,
      data: oracles,
      oracles,
      getNeighbors: (oracleId: string) => resolveOracleNeighbors(oracles, oracleId),
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
