import { useMemo } from "react";
import { useLeverxMarketAsk } from "@/hooks/useLeverxMarketAsk";
import { isContractQuotePaused } from "@/lib/leverx/contract-quote";
import { formatContractPremiumLabel } from "@/lib/leverx/indexer-markets";
import { tradeSideToMarketKey } from "@/lib/leverx/market-keys";
import type { PredictSide } from "@/lib/predict/instruments";

/** Live LP mint price with indexer catalog fallback (1e9-scaled raw premium). */
export function useLiveContractPremium(args: {
  oracleId: string;
  expiryMs?: number;
  strikeRaw?: number;
  higherStrikeRaw?: number;
  side: PredictSide;
  catalogPremium?: number | null;
}) {
  const marketKey = useMemo(() => {
    if (!args.expiryMs) return undefined;
    if (args.side === "range") {
      const lower = args.strikeRaw;
      const upper = args.higherStrikeRaw;
      if (!lower || !upper || upper <= lower) return undefined;
      return tradeSideToMarketKey({
        oracleId: args.oracleId,
        expiryMs: args.expiryMs,
        strike: lower,
        higherStrike: upper,
        side: args.side,
      });
    }
    if (!args.strikeRaw) return undefined;
    return tradeSideToMarketKey({
      oracleId: args.oracleId,
      expiryMs: args.expiryMs,
      strike: args.strikeRaw,
      higherStrike: args.higherStrikeRaw,
      side: args.side,
    });
  }, [args.oracleId, args.expiryMs, args.strikeRaw, args.higherStrikeRaw, args.side]);

  const {
    data: liveAskRaw,
    isPending,
    isFetching,
    isError,
    isFetched,
  } = useLeverxMarketAsk(marketKey);

  const quotePaused = useMemo(
    () =>
      isContractQuotePaused({
        enabled: Boolean(marketKey),
        isPending,
        isFetching,
        isError,
        isFetched,
        liveAskRaw,
      }),
    [marketKey, isPending, isFetching, isError, isFetched, liveAskRaw],
  );

  const label = useMemo(() => {
    if (quotePaused) return "Paused";
    return formatContractPremiumLabel({
      liveAskRaw,
      catalogPremium: args.catalogPremium,
      loading: (isPending || isFetching) && liveAskRaw == null && !args.catalogPremium,
    });
  }, [quotePaused, liveAskRaw, args.catalogPremium, isPending, isFetching]);

  const premiumRaw = quotePaused
    ? null
    : liveAskRaw != null && liveAskRaw > 0n
      ? Number(liveAskRaw)
      : args.catalogPremium != null && args.catalogPremium > 0
        ? args.catalogPremium
        : null;

  return {
    label,
    premiumRaw,
    liveAskRaw,
    quotePaused,
    isLoading: isPending && liveAskRaw == null,
  };
}
