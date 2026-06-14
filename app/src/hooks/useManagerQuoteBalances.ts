import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { fetchManagerQuoteBalance } from "@/lib/leverx/quotes";
import { MAX_MARGIN_USD } from "@/lib/leverx/trade-limits";
import { QUOTE_UNIT } from "@/lib/predict/constants";

/** Reject devInspect garbage — manager balance should not exceed max leveraged notional. */
const MAX_MANAGER_BALANCE_ATOMS = BigInt(Math.ceil(MAX_MARGIN_USD * 10 * 10)) * QUOTE_UNIT;

export type ManagerQuoteBalanceRow = {
  predictManagerId: string;
  balanceAtoms: bigint;
};

/** Unique Predict managers with on-chain quote balance (shared pool, not per market key). */
export function useManagerQuoteBalances(
  accountId: string | undefined,
  positions: readonly LeveragedPosition[],
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
    () => positions.some((position) => position.borrow_quote > 0),
    [positions],
  );

  const queries = useQueries({
    queries: managerIds.map((predictManagerId) => ({
      queryKey: ["manager-quote-balance", accountId, predictManagerId, cfg?.packageId, cfg?.quoteType],
      queryFn: async (): Promise<ManagerQuoteBalanceRow> => {
        let balanceAtoms = await fetchManagerQuoteBalance({
          client,
          packageId: cfg!.packageId,
          predictManagerId,
          quoteType: cfg!.quoteType,
        });
        if (balanceAtoms == null) {
          balanceAtoms = 0n;
        } else if (balanceAtoms > MAX_MANAGER_BALANCE_ATOMS) {
          balanceAtoms = 0n;
        }
        return { predictManagerId, balanceAtoms };
      },
      enabled: Boolean(cfg?.packageId && cfg?.quoteType && managerIds.length > 0),
      staleTime: 10_000,
      refetchInterval: 15_000,
      retry: 1,
    })),
  });

  const rows = useMemo(
    () =>
      queries
        .map((q) => q.data)
        .filter((row): row is ManagerQuoteBalanceRow => row != null)
        .filter((row) => row.balanceAtoms > 0n && !accountHasDebt),
    [queries, accountHasDebt],
  );

  const isLoading = queries.some((q) => q.isLoading && q.fetchStatus !== "idle");

  return { rows, isLoading, refetch: () => queries.forEach((q) => void q.refetch()) };
}
