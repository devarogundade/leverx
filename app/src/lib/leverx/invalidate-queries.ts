import type { QueryClient } from "@tanstack/react-query";

/** Query-key prefixes invalidated after any LeverX on-chain mutation. */
const LEVERX_MUTATION_QUERY_PREFIXES = [
  // Indexer REST + WS-backed caches
  "indexer-protocol",
  "indexer-market-catalog",
  "indexer-orderbook",
  "indexer-global-trades",
  "indexer-positions",
  "indexer-limit-orders",
  "indexer-accounts",
  "indexer-account",
  "indexer-vault-summary",
  "indexer-vault-history",
  "indexer-collateral",
  "indexer-triggers",
  "indexer-executors",
  "indexer-collateral-balances",
  "indexer-liquidations",
  "indexer-leaderboard",
  // Wallet balances & on-chain quote simulation
  "wallet-coin-balance",
  "leverx-mint-quote",
  // Predict server portfolio / vault (manager link, protection positions)
  "predict-manager-id",
  "predict-manager-summary",
  "predict-manager-positions",
  "predict-vault-summary",
  "predict-vault-performance",
] as const;

/** Refetch all app queries that may change after a LeverX contract call. */
export async function invalidateLeverxQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    LEVERX_MUTATION_QUERY_PREFIXES.map((prefix) =>
      queryClient.invalidateQueries({ queryKey: [prefix] }),
    ),
  );
}
