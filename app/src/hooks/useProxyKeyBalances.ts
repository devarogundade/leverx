import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import { fetchKeyWithdrawableQuote } from "@/lib/leverx/quotes";
import { MAX_MARGIN_USD } from "@/lib/leverx/trade-limits";
import { QUOTE_UNIT } from "@/lib/predict/constants";

/** Reject devInspect garbage — no single key should hold more than max leveraged notional. */
const MAX_KEY_BALANCE_ATOMS = BigInt(Math.ceil(MAX_MARGIN_USD * 10 * 10)) * QUOTE_UNIT;

export type ProxyKeyBalanceRow = {
  position: LeveragedPosition;
  key: MarketKeyArgs;
  balanceAtoms: bigint;
};

function positionToKey(position: LeveragedPosition): MarketKeyArgs {
  return {
    oracleId: position.oracle_id,
    expiryMs: position.expiry_ms,
    strike: position.strike,
    higherStrike: position.higher_strike,
    isUp: position.is_up,
    isRange: position.is_range,
  };
}

/** Unique market keys from position history with on-chain withdrawable balances. */
export function useProxyKeyBalances(
  accountId: string | undefined,
  positions: readonly LeveragedPosition[],
) {
  const { client } = useWallet();
  const { cfg } = useLeverxProtocolConfig();

  const uniquePositions = useMemo(() => {
    const byKey = new Map<string, LeveragedPosition>();
    for (const position of positions) {
      const existing = byKey.get(position.position_key);
      const recency = position.closed_at_ms ?? position.opened_at_ms ?? 0;
      const existingRecency = existing
        ? (existing.closed_at_ms ?? existing.opened_at_ms ?? 0)
        : -1;
      if (!existing || recency >= existingRecency) {
        byKey.set(position.position_key, position);
      }
    }
    return [...byKey.values()];
  }, [positions]);

  const queries = useQueries({
    queries: uniquePositions.map((position) => ({
      queryKey: [
        "proxy-key-balance",
        accountId,
        position.position_key,
        cfg?.packageId,
        cfg?.predictPackageId,
      ],
      queryFn: async (): Promise<ProxyKeyBalanceRow> => {
        const key = positionToKey(position);
        let balanceAtoms = await fetchKeyWithdrawableQuote({
          client,
          leverxPackageId: cfg!.packageId,
          predictPackageId: cfg!.predictPackageId,
          accountId: accountId!,
          key,
        });
        if (balanceAtoms > MAX_KEY_BALANCE_ATOMS) {
          balanceAtoms = 0n;
        }
        return { position, key, balanceAtoms };
      },
      enabled: Boolean(cfg?.packageId && cfg?.predictPackageId && accountId),
      staleTime: 10_000,
      refetchInterval: 15_000,
      retry: 1,
    })),
  });

  const withdrawable = useMemo(
    () =>
      queries
        .map((q) => q.data)
        .filter((row): row is ProxyKeyBalanceRow => row != null)
        .filter((row) => row.balanceAtoms > 0n),
    [queries],
  );

  const isLoading = queries.some((q) => q.isLoading && q.fetchStatus !== "idle");

  return { rows: withdrawable, isLoading, refetch: () => queries.forEach((q) => void q.refetch()) };
}
