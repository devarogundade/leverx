import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { fetchTradingQuoteBalance } from "@/lib/leverx/quotes";
import { MAX_MARGIN_USD } from "@/lib/leverx/trade-limits";
import { QUOTE_UNIT } from "@/lib/predict/constants";
import { scaleQuoteAtoms } from "@/lib/predict/scaling";

/** Reject devInspect garbage — the pool should never exceed a generous notional ceiling. */
const MAX_TRADING_BALANCE_ATOMS = BigInt(Math.ceil(MAX_MARGIN_USD * 100)) * QUOTE_UNIT;

/**
 * On-chain balance of the proxy's single trading account (key-agnostic).
 *
 * This is the one spendable, fully-withdrawable pool that funds every position. Read via
 * devInspect of `user_proxy::withdrawable_trading_quote` since custody balances are not indexed.
 */
export function useTradingAccountBalance(accountId: string | undefined) {
  const { client } = useWallet();
  const { cfg } = useLeverxProtocolConfig();

  const query = useQuery({
    queryKey: ["trading-account-balance", accountId, cfg?.packageId],
    queryFn: async (): Promise<bigint> => {
      let atoms = await fetchTradingQuoteBalance({
        client,
        leverxPackageId: cfg!.packageId,
        accountId: accountId!,
      });
      if (atoms > MAX_TRADING_BALANCE_ATOMS) atoms = 0n;
      return atoms;
    },
    enabled: Boolean(cfg?.packageId && accountId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });

  const atoms = query.data ?? 0n;

  return {
    atoms,
    usd: scaleQuoteAtoms(atoms),
    isLoading: query.isLoading && query.fetchStatus !== "idle",
    refetch: () => void query.refetch(),
  };
}
