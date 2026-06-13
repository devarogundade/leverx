import { useMemo } from "react";
import { useLeverxMarketAsk } from "@/hooks/useLeverxMarketAsk";
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
  const marketKey = useMemo(
    () =>
      args.expiryMs && args.strikeRaw
        ? tradeSideToMarketKey({
            oracleId: args.oracleId,
            expiryMs: args.expiryMs,
            strike: args.strikeRaw,
            higherStrike: args.higherStrikeRaw,
            side: args.side,
          })
        : undefined,
    [args.oracleId, args.expiryMs, args.strikeRaw, args.higherStrikeRaw, args.side],
  );

  const { data: liveAskRaw, isLoading, isFetching } = useLeverxMarketAsk(marketKey);

  const label = useMemo(
    () =>
      formatContractPremiumLabel({
        liveAskRaw,
        catalogPremium: args.catalogPremium,
        loading: (isLoading || isFetching) && liveAskRaw == null && !args.catalogPremium,
      }),
    [liveAskRaw, args.catalogPremium, isLoading, isFetching],
  );

  const premiumRaw =
    liveAskRaw != null && liveAskRaw > 0n
      ? Number(liveAskRaw)
      : args.catalogPremium != null && args.catalogPremium > 0
        ? args.catalogPremium
        : null;

  return { label, premiumRaw, liveAskRaw, isLoading: isLoading && liveAskRaw == null };
}
