import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { QUOTE_UNIT } from "@/lib/predict/constants";
import { normalizeQuoteAssetType } from "@/lib/predict/quote-assets";

function decimalsForCoin(coinType: string, override?: number): number {
  if (override != null) return override;
  return coinType.includes("sui::SUI") ? 9 : 6;
}

export function useWalletCoinBalance(coinType: string | null, decimalsOverride?: number) {
  const { client, address } = useWallet();
  const normalized = coinType ? normalizeQuoteAssetType(coinType) : null;
  const decimals = normalized ? decimalsForCoin(normalized, decimalsOverride) : 6;
  const scale = 10 ** decimals;

  return useQuery({
    queryKey: ["wallet-coin-balance", address, normalized, decimals],
    queryFn: async () => {
      const balance = await client.getBalance({
        owner: address!,
        coinType: normalized!,
      });
      return Number(balance.totalBalance) / scale;
    },
    enabled: Boolean(address && normalized),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
