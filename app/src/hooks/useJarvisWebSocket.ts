import { useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { appConfig } from "@/lib/config";
import {
  JarvisEventRecordSchema,
  JarvisStatusResponseSchema,
  JarvisUnreadPayloadSchema,
  type JarvisEventRecord,
} from "@/lib/leverx/jarvis-schemas";
import { jarvisEventsQueryKey } from "@/lib/leverx/jarvis-query-keys";

export type JarvisConnectionState = "connected" | "connecting" | "disconnected";

type UseJarvisWebSocketArgs = {
  owner?: string;
  accountId?: string;
  enabled?: boolean;
};

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

function jarvisStatusKey(owner: string, accountId: string) {
  return ["jarvis-status", owner, accountId] as const;
}

function prependLiveEvent(
  prev: InfiniteData<JarvisEventRecord[]> | undefined,
  record: JarvisEventRecord,
): InfiniteData<JarvisEventRecord[]> {
  if (!prev?.pages?.length) {
    return { pages: [[record]], pageParams: [undefined] };
  }

  const firstPage = prev.pages[0] ?? [];
  if (firstPage.some((row) => row.id === record.id)) return prev;

  return {
    ...prev,
    pages: [
      [record, ...firstPage].sort(
        (a, b) => Number(b.created_at_ms) - Number(a.created_at_ms),
      ),
      ...prev.pages.slice(1),
    ],
  };
}

export function useJarvisWebSocket({
  owner,
  accountId,
  enabled = true,
}: UseJarvisWebSocketArgs): { connectionState: JarvisConnectionState } {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<number | null>(null);
  const [connectionState, setConnectionState] =
    useState<JarvisConnectionState>("disconnected");

  useEffect(() => {
    const normalizedOwner = owner?.trim().toLowerCase();
    const normalizedAccountId = accountId?.trim().toLowerCase();
    if (!enabled || !normalizedOwner || !normalizedAccountId || !appConfig.jarvisWsUrl) {
      setConnectionState("disconnected");
      return;
    }

    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const subscribe = (socket: Socket) => {
      socket.emit("subscribe", {
        owner: normalizedOwner,
        account_id: normalizedAccountId,
      });
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearReconnectTimer();
      setConnectionState("connecting");
      const delay = backoffRef.current;
      reconnectTimerRef.current = window.setTimeout(() => {
        if (disposed) return;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      clearReconnectTimer();
      setConnectionState("connecting");

      const socket = io(appConfig.jarvisWsUrl!, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        autoConnect: true,
        reconnection: false,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (disposed) return;
        backoffRef.current = INITIAL_BACKOFF_MS;
        setConnectionState("connected");
        subscribe(socket);
      });

      socket.on("disconnect", () => {
        if (disposed) return;
        setConnectionState("disconnected");
        scheduleReconnect();
      });

      socket.on("connect_error", () => {
        if (disposed) return;
        socket.disconnect();
        setConnectionState("disconnected");
        scheduleReconnect();
      });

      socket.on("jarvis.event", (payload: unknown) => {
        const parsed = JarvisEventRecordSchema.safeParse(payload);
        if (!parsed.success) return;

        const record: JarvisEventRecord = parsed.data;
        const eventsKey = jarvisEventsQueryKey(normalizedOwner, normalizedAccountId);
        queryClient.setQueryData<InfiniteData<JarvisEventRecord[]>>(
          eventsKey,
          (prev) => prependLiveEvent(prev, record),
        );
        queryClient.invalidateQueries({
          queryKey: jarvisStatusKey(normalizedOwner, normalizedAccountId),
        });
      });

      socket.on("jarvis.unread", (payload: unknown) => {
        const parsed = JarvisUnreadPayloadSchema.safeParse(payload);
        if (!parsed.success) return;

        queryClient.setQueryData(
          jarvisStatusKey(normalizedOwner, normalizedAccountId),
          (prev: unknown) => {
            const status = JarvisStatusResponseSchema.safeParse(prev);
            if (!status.success) return prev;
            return {
              ...status.data,
              unread_count: parsed.data.unread_count,
            };
          },
        );
      });
    };

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      const socket = socketRef.current;
      if (socket) {
        socket.emit("unsubscribe", {
          owner: normalizedOwner,
          account_id: normalizedAccountId,
        });
        socket.removeAllListeners();
        socket.disconnect();
        socketRef.current = null;
      }
      setConnectionState("disconnected");
    };
  }, [owner, accountId, enabled, queryClient]);

  return { connectionState };
}
