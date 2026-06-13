import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useIndexerProtocol } from "@/hooks/useIndexer";
import { useLeverxProtocolConfig } from "@/hooks/useLeverxTransactions";
import { resolveLiquidationBps } from "@/lib/leverx/protocol";
import type { LeveragedPosition } from "@/lib/leverx/indexer-client";
import { positionKeyFromArgs } from "@/lib/leverx/market-keys";
import {
  computePositionMarkToMarket,
  isActiveOpenPosition,
  positionRowId,
  type PositionMarkToMarket,
} from "@/lib/leverx/position-metrics";
import { fetchRedeemQuote } from "@/lib/leverx/quotes";

function positionToMarketKey(position: LeveragedPosition) {
  return {
    oracleId: position.oracle_id,
    expiryMs: position.expiry_ms,
    strike: position.strike,
    higherStrike: position.higher_strike,
    isUp: position.is_up,
    isRange: position.is_range,
  };
}

export function usePositionsMarkToMarket(positions: readonly LeveragedPosition[]) {
  const { client } = useWallet();
  const { cfg } = useLeverxProtocolConfig();
  const { data: protocol } = useIndexerProtocol();
  const liquidationBps = resolveLiquidationBps(protocol);

  const openPositions = useMemo(
    () => positions.filter(isActiveOpenPosition),
    [positions],
  );

  const quoteQueries = useQueries({
    queries: openPositions.map((position) => ({
      queryKey: [
        "position-redeem-quote",
        position.position_key,
        position.open_quantity,
        cfg?.packageId,
      ],
      queryFn: async () => {
        if (!cfg) return null;
        return fetchRedeemQuote({
          client,
          cfg,
          key: positionToMarketKey(position),
          quantity: BigInt(position.open_quantity),
        });
      },
      enabled: Boolean(cfg?.registryId && position.open_quantity > 0),
      staleTime: 8_000,
      refetchInterval: 12_000,
      retry: 1,
    })),
  });

  const byPositionId = useMemo(() => {
    const map = new Map<string, PositionMarkToMarket>();
    openPositions.forEach((position, index) => {
      const query = quoteQueries[index];
      map.set(
        positionRowId(position),
        computePositionMarkToMarket(
          position,
          query?.data ?? null,
          Boolean(query?.isLoading),
          liquidationBps,
        ),
      );
    });
    return map;
  }, [openPositions, quoteQueries, liquidationBps]);

  const isRefreshing = quoteQueries.some((q) => q.isFetching);

  return { byPositionId, isRefreshing };
}

export function positionMarketKeyLabel(position: LeveragedPosition): string {
  return positionKeyFromArgs(positionToMarketKey(position));
}
