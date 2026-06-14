import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { appConfig } from "@/lib/config";
import {
  getIndexerWebSocket,
  type IndexerWsConnectionStatus,
  type IndexerWsMessage,
} from "@/lib/leverx/indexer-ws";
import type {
  GlobalMarketTrade,
  LeveragedPosition,
  LimitMintOrder,
  OrderBookResponse,
  Paginated,
} from "@/lib/leverx/indexer-client";
import { indexerKeys } from "@/hooks/useIndexer";

type Ctx = {
  status: IndexerWsConnectionStatus;
  isLive: boolean;
};

const IndexerStreamContext = createContext<Ctx>({
  status: "idle",
  isLive: false,
});

function parseOrderbookChannel(channel: string) {
  const parts = channel.split(":");
  if (parts[0] !== "orderbook" || parts.length < 7) return null;
  return {
    oracleId: parts[1]!,
    expiryMs: Number(parts[2]),
    strike: Number(parts[3]),
    higherStrike: Number(parts[4]),
    isUp: parts[5] === "1",
    isRange: parts[6] === "1",
  };
}

function parsePositionsChannel(channel: string) {
  const parts = channel.split(":");
  if (parts[0] !== "positions" || !parts[1]) return null;
  return { owner: parts[1], oracleId: parts[2] };
}

function parseLimitsChannel(channel: string) {
  const parts = channel.split(":");
  if (parts[0] !== "limits" || !parts[1]) return null;
  return { owner: parts[1], oracleId: parts[2] };
}

function applyStreamMessage(queryClient: ReturnType<typeof useQueryClient>, message: IndexerWsMessage) {
  if (!message.channel || message.data == null) return;

  if (message.type === "orderbook.snapshot") {
    const parsed = parseOrderbookChannel(message.channel);
    if (!parsed) return;
    queryClient.setQueryData(
      indexerKeys.orderBook(
        parsed.oracleId,
        parsed.expiryMs,
        parsed.strike,
        parsed.higherStrike,
        parsed.isUp,
        parsed.isRange,
      ),
      message.data as OrderBookResponse,
    );
    return;
  }

  if (message.type === "trades.global.snapshot") {
    const oracleId = message.channel.replace("trades:global:", "");
    const page = message.data as Paginated<GlobalMarketTrade>;
    queryClient.setQueryData(indexerKeys.globalTrades(oracleId), page.items);
    return;
  }

  if (message.type === "positions.snapshot") {
    const parsed = parsePositionsChannel(message.channel);
    if (!parsed) return;
    const page = message.data as Paginated<LeveragedPosition>;
    queryClient.setQueryData(
      indexerKeys.positions(parsed.owner, "open", parsed.oracleId),
      page.items,
    );
    // WS only streams open rows; closed history and account debt change on close/liquidation.
    void queryClient.invalidateQueries({
      queryKey: ["indexer-positions", parsed.owner, "closed"],
    });
    void queryClient.invalidateQueries({ queryKey: ["indexer-liquidations"] });
    void queryClient.invalidateQueries({
      queryKey: ["indexer-accounts", parsed.owner],
    });
    return;
  }

  if (message.type === "limits.snapshot") {
    const parsed = parseLimitsChannel(message.channel);
    if (!parsed) return;
    const page = message.data as Paginated<LimitMintOrder>;
    queryClient.setQueryData(
      indexerKeys.limitOrders(parsed.owner, parsed.oracleId),
      page.items,
    );
  }
}

export function IndexerStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const enabled = appConfig.indexerStreamEnabled;
  const ws = useMemo(() => getIndexerWebSocket(), []);
  const [status, setStatus] = useState<IndexerWsConnectionStatus>("idle");

  useEffect(() => {
    if (!enabled) return;

    ws.connect();
    const offStatus = ws.onStatus(setStatus);
    const offMessage = ws.onMessage((message) => {
      applyStreamMessage(queryClient, message);
    });

    return () => {
      offStatus();
      offMessage();
    };
  }, [enabled, queryClient, ws]);

  const value = useMemo(
    () => ({
      status,
      isLive: status === "open",
    }),
    [status],
  );

  return (
    <IndexerStreamContext.Provider value={value}>{children}</IndexerStreamContext.Provider>
  );
}

export function useIndexerStream() {
  return useContext(IndexerStreamContext);
}

export function useIndexerChannelSubscription(
  channels: string[],
  enabled = true,
): void {
  const ws = useMemo(() => getIndexerWebSocket(), []);

  useEffect(() => {
    if (!enabled || channels.length === 0) return;
    ws.subscribe(channels);
    return () => {
      ws.unsubscribe(channels);
    };
  }, [ws, enabled, channels.join("|")]);
}
