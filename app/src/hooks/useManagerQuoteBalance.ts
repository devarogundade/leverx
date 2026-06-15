import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { fetchManagerQuoteBalance } from "@/lib/leverx/quotes";
import { MAX_MARGIN_USD } from "@/lib/leverx/trade-limits";
import { QUOTE_UNIT } from "@/lib/predict/constants";

/** Reject devInspect garbage — manager balance should not exceed max leveraged notional. */
const MAX_MANAGER_BALANCE_ATOMS = BigInt(Math.ceil(MAX_MARGIN_USD * 10 * 10)) * QUOTE_UNIT;

export function managerQuoteBalanceQueryKey(
  predictManagerId: string | undefined,
  packageId: string | undefined,
  quoteType: string | undefined,
) {
  return ["manager-quote-balance", predictManagerId, packageId, quoteType] as const;
}

export function sanitizeManagerQuoteBalanceAtoms(atoms: bigint | null | undefined): bigint {
  if (atoms == null) return 0n;
  if (atoms > MAX_MANAGER_BALANCE_ATOMS) return 0n;
  return atoms;
}

/** On-chain quote balance in a linked Predict manager (shared pool). */
export function useManagerQuoteBalance(predictManagerId: string | undefined) {
  const { client } = useWallet();
  const { cfg } = useLeverxProtocolConfig();

  const enabled = Boolean(predictManagerId && cfg?.packageId && cfg?.quoteType);

  return useQuery({
    queryKey: managerQuoteBalanceQueryKey(predictManagerId, cfg?.packageId, cfg?.quoteType),
    queryFn: () =>
      fetchManagerQuoteBalance({
        client,
        packageId: cfg!.packageId,
        predictManagerId: predictManagerId!,
        quoteType: cfg!.quoteType,
      }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}
