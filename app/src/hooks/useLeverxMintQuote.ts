import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts } from "@/hooks/useIndexer";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import { fetchMintQuote } from "@/lib/leverx/quotes";
import { leverageToBps, marginUsdToQuoteAtoms } from "@/lib/leverx/trade-math";

export function useLeverxMintQuote(args: {
  key?: MarketKeyArgs;
  marginUsd?: number;
  leverage?: number;
  quantity?: bigint;
  owner?: string;
  enabled?: boolean;
}) {
  const { client } = useWallet();
  const cfg = useLeverxProtocolConfig();
  const { data: accounts = [] } = useIndexerAccounts(args.owner);
  const accountId = accounts[0]?.account_id;

  const marginAtoms = marginUsdToQuoteAtoms(args.marginUsd ?? 0);
  const leverageBps = leverageToBps(args.leverage ?? 1.1);
  const quantity = args.quantity && args.quantity > 0n ? args.quantity : 1n;

  return useQuery({
    queryKey: [
      "leverx-mint-quote",
      args.key?.oracleId,
      args.key?.strike,
      marginAtoms.toString(),
      leverageBps.toString(),
      quantity.toString(),
      accountId,
    ],
    queryFn: async () => {
      if (!cfg || !args.key) return null;
      return fetchMintQuote({
        client,
        cfg,
        accountId,
        key: args.key,
        marginQuoteAtoms: marginAtoms,
        leverageBps,
        quantity,
      });
    },
    enabled:
      Boolean(args.enabled ?? true) &&
      Boolean(cfg) &&
      Boolean(args.key) &&
      marginAtoms > 0n &&
      (args.marginUsd ?? 0) > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}
