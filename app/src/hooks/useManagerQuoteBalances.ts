import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import {
  managerQuoteBalanceQueryKey,
  sanitizeManagerQuoteBalanceAtoms,
} from "@/hooks/useManagerQuoteBalance";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { fetchManagerQuoteBalance } from "@/lib/leverx/quotes";

export type ManagerQuoteBalanceRow = {
  predictManagerId: string;
  balanceAtoms: bigint;
};

/** Unique Predict managers with on-chain quote balance (shared pool, not per market key). */
export function useManagerQuoteBalances(
  _accountId: string | undefined,
  positions: readonly LeveragedPosition[],
  borrowedQuote = 0,
) {
  const { client } = useWallet();
  const { cfg } = useLeverxProtocolConfig();

  const managerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const position of positions) {
      if (position.predict_manager_id) {
        ids.add(position.predict_manager_id);
      }
    }
    return [...ids];
  }, [positions]);

  const accountHasDebt = useMemo(
    () =>
      borrowedQuote > 0 || positions.some((position) => position.borrow_quote > 0),
    [borrowedQuote, positions],
  );

  const queries = useQueries({
    queries: managerIds.map((predictManagerId) => ({
      queryKey: managerQuoteBalanceQueryKey(predictManagerId, cfg?.packageId, cfg?.quoteType),
      queryFn: () =>
        fetchManagerQuoteBalance({
          client,
          packageId: cfg!.packageId,
          predictManagerId,
          quoteType: cfg!.quoteType,
        }),
      enabled: Boolean(cfg?.packageId && cfg?.quoteType && managerIds.length > 0),
      staleTime: 10_000,
      refetchInterval: 15_000,
      retry: 1,
    })),
  });

  const rows = useMemo(
    () =>
      managerIds
        .map((predictManagerId, index) => {
          const balanceAtoms = sanitizeManagerQuoteBalanceAtoms(queries[index]?.data);
          return { predictManagerId, balanceAtoms };
        })
        .filter((row) => row.balanceAtoms > 0n && !accountHasDebt),
    [managerIds, queries, accountHasDebt],
  );

  const isLoading = queries.some((q) => q.isLoading && q.fetchStatus !== "idle");

  return { rows, isLoading, refetch: () => queries.forEach((q) => void q.refetch()) };
}
