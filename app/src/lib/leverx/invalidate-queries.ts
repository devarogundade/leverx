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
  "indexer-triggers",
  "indexer-executors",
  "indexer-liquidations",
  "indexer-leaderboard",
  // Wallet balances & on-chain quote simulation
  "wallet-coin-balance",
  "trading-account-balance",
  "leverx-mint-quote",
  "leverx-market-ask",
  "position-redeem-quote",
  "proxy-key-balance",
  // Predict server portfolio / vault (manager link, protection positions)
  "predict-manager-id",
  "predict-manager-summary",
  "predict-manager-positions",
  "predict-vault-summary",
  "predict-vault-performance",
] as const;

/** Indexer-backed caches that often lag the keeper relay by a few seconds. */
const INDEXER_CATCH_UP_PREFIXES = [
  "indexer-positions",
  "indexer-limit-orders",
  "indexer-accounts",
  "indexer-account",
  "indexer-triggers",
  "indexer-executors",
  "trading-account-balance",
] as const;

const INDEXER_CATCH_UP_DELAYS_MS = [1500, 4000, 8000, 15000] as const;

function scheduleIndexerCatchUpRefetch(queryClient: QueryClient): void {
  for (const delayMs of INDEXER_CATCH_UP_DELAYS_MS) {
    globalThis.setTimeout(() => {
      void Promise.all(
        INDEXER_CATCH_UP_PREFIXES.map((prefix) =>
          queryClient.invalidateQueries({ queryKey: [prefix], refetchType: "active" }),
        ),
      );
    }, delayMs);
  }
}

/** Refetch all app queries that may change after a LeverX contract call. */
export async function invalidateLeverxQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    LEVERX_MUTATION_QUERY_PREFIXES.map((prefix) =>
      queryClient.invalidateQueries({ queryKey: [prefix], refetchType: "active" }),
    ),
  );
  scheduleIndexerCatchUpRefetch(queryClient);
}
