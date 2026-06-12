import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { appConfig } from "@/lib/config";
import type { MarketKeyArgs } from "@/lib/leverx/market-keys";
import { fetchPredictMarketAsk } from "@/lib/leverx/quotes";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";

function quoteCfg(packageId: string | undefined, predictId?: string) {
  if (!packageId) return null;
  return { packageId, predictId: predictId ?? appConfig.predictId };
}

/** Live per-contract ask for a market (no margin / account required). */
export function useLeverxMarketAsk(key?: MarketKeyArgs) {
  const { client } = useWallet();
  const fullCfg = useLeverxProtocolConfig();
  const cfg = useMemo(
    () => quoteCfg(fullCfg?.packageId ?? appConfig.leverxPackageId, fullCfg?.predictId),
    [fullCfg?.packageId, fullCfg?.predictId],
  );

  return useQuery({
    queryKey: [
      "leverx-market-ask",
      key?.oracleId,
      key?.expiryMs,
      key?.strike,
      key?.higherStrike,
      key?.isUp,
      key?.isRange,
    ],
    queryFn: async () => {
      if (!cfg || !key) return null;
      return fetchPredictMarketAsk({ client, cfg, key });
    },
    enabled: Boolean(cfg && key),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
    retry: 1,
  });
}
