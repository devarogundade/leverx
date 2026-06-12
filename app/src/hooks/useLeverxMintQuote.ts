import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useIndexerAccounts, useIndexerProtocol } from "@/hooks/useIndexer";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { appConfig } from "@/lib/config";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import { fetchMintQuote } from "@/lib/leverx/quotes";
import type { LeverxProtocolConfig } from "@/lib/leverx/protocol";
import { leverageToBps, marginUsdToQuoteAtoms } from "@/lib/leverx/trade-math";

function quoteReadyConfig(
  full: LeverxProtocolConfig | null | undefined,
): LeverxProtocolConfig | null {
  if (full?.packageId && full.predictId) return full;
  const packageId = appConfig.leverxPackageId;
  if (!packageId) return null;
  return {
    packageId,
    registryId: full?.registryId ?? "",
    vaultId: full?.vaultId ?? "",
    feeCollectorId: full?.feeCollectorId ?? "",
    predictId: full?.predictId ?? appConfig.predictId,
    predictPackageId: appConfig.predictPackageId,
    predictRegistryId: full?.predictRegistryId ?? appConfig.predictRegistryId,
    quoteType: appConfig.quoteType,
  };
}

export function useLeverxMintQuote(args: {
  key?: MarketKeyArgs;
  marginUsd?: number;
  leverage?: number;
  owner?: string;
  enabled?: boolean;
  /** Size quote quantity against limit premium (resting orders). */
  referencePremiumOverride?: bigint;
}) {
  const { client } = useWallet();
  const fullCfg = useLeverxProtocolConfig();
  const { data: protocol } = useIndexerProtocol();
  const cfg = useMemo(
    () => quoteReadyConfig(fullCfg),
    [fullCfg, protocol?.predict_id],
  );
  const { data: accounts = [] } = useIndexerAccounts(args.owner);
  const accountId = accounts[0]?.account_id;

  const marginAtoms = marginUsdToQuoteAtoms(args.marginUsd ?? 0);
  const leverageBps = leverageToBps(args.leverage ?? 1.1);

  const query = useQuery({
    queryKey: [
      "leverx-mint-quote",
      args.key?.oracleId,
      args.key?.strike,
      args.key?.higherStrike,
      args.key?.expiryMs,
      args.key?.isUp,
      args.key?.isRange,
      marginAtoms.toString(),
      leverageBps.toString(),
      accountId,
      cfg?.packageId,
      args.referencePremiumOverride?.toString(),
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
        referencePremiumOverride: args.referencePremiumOverride,
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
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  return query;
}
