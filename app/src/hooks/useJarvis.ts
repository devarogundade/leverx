import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appConfig } from "@/lib/config";
import {
  disableJarvis,
  enableJarvis,
  fetchJarvisEvents,
  fetchJarvisSettings,
  fetchJarvisStatus,
  markJarvisEventsRead,
  updateJarvisSettings,
  type JarvisEventRecord,
  type JarvisGuardrails,
  type JarvisSettingsResponse,
  type JarvisStatusResponse,
  type JarvisUpdateSettingsBody,
} from "@/lib/leverx/keeper-client";
import { useJarvisWebSocket } from "@/hooks/useJarvisWebSocket";

export function jarvisSettingsQueryKey(owner: string, accountId: string) {
  return [
    "jarvis-settings",
    owner.trim().toLowerCase(),
    accountId.trim().toLowerCase(),
  ] as const;
}

export function jarvisStatusQueryKey(owner: string, accountId: string) {
  return [
    "jarvis-status",
    owner.trim().toLowerCase(),
    accountId.trim().toLowerCase(),
  ] as const;
}

export function jarvisEventsQueryKey(owner: string, accountId: string) {
  return [
    "jarvis-events",
    owner.trim().toLowerCase(),
    accountId.trim().toLowerCase(),
  ] as const;
}

export function isJarvisConfigured(): boolean {
  return Boolean(appConfig.keeperApiUrl?.trim());
}

export function useJarvisStatus(
  owner: string | null | undefined,
  accountId: string | null | undefined,
) {
  const enabled = Boolean(owner && accountId);
  return useQuery({
    queryKey: enabled
      ? jarvisStatusQueryKey(owner!, accountId!)
      : ["jarvis-status", "idle"],
    queryFn: () => fetchJarvisStatus({ owner: owner!, accountId: accountId! }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useJarvisEvents(
  owner: string | null | undefined,
  accountId: string | null | undefined,
) {
  const enabled = Boolean(owner && accountId);
  return useQuery({
    queryKey: enabled
      ? jarvisEventsQueryKey(owner!, accountId!)
      : ["jarvis-events", "idle"],
    queryFn: () =>
      fetchJarvisEvents({ owner: owner!, accountId: accountId!, limit: 100 }),
    enabled,
    staleTime: 10_000,
  });
}

export function useJarvisSettings(
  owner: string | null | undefined,
  accountId: string | null | undefined,
) {
  const enabled = Boolean(owner && accountId);
  return useQuery({
    queryKey: enabled
      ? jarvisSettingsQueryKey(owner!, accountId!)
      : ["jarvis-settings", "idle"],
    queryFn: () => fetchJarvisSettings({ owner: owner!, accountId: accountId! }),
    enabled,
    staleTime: 15_000,
  });
}

export function useUpdateJarvisSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JarvisUpdateSettingsBody) => updateJarvisSettings(body),
    onSuccess: (settings, body) => {
      queryClient.setQueryData(
        jarvisSettingsQueryKey(body.owner, body.account_id),
        settings,
      );
      queryClient.setQueryData(
        jarvisStatusQueryKey(body.owner, body.account_id),
        (prev: JarvisStatusResponse | undefined) =>
          prev ? { ...prev, guardrails: settings.guardrails } : prev,
      );
    },
  });
}

export function useEnableJarvis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; accountId: string }) =>
      enableJarvis(params),
    onSuccess: (status, params) => {
      queryClient.setQueryData(
        jarvisStatusQueryKey(params.owner, params.accountId),
        status,
      );
      void queryClient.invalidateQueries({
        queryKey: jarvisEventsQueryKey(params.owner, params.accountId),
      });
    },
  });
}

export function useDisableJarvis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { owner: string; accountId: string }) =>
      disableJarvis(params),
    onSuccess: (status, params) => {
      queryClient.setQueryData(
        jarvisStatusQueryKey(params.owner, params.accountId),
        status,
      );
      void queryClient.invalidateQueries({
        queryKey: jarvisEventsQueryKey(params.owner, params.accountId),
      });
    },
  });
}

export function useMarkJarvisRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      owner: string;
      accountId: string;
      eventIds?: string[];
    }) => markJarvisEventsRead(params),
    onSuccess: (_result, params) => {
      void queryClient.invalidateQueries({
        queryKey: jarvisStatusQueryKey(params.owner, params.accountId),
      });
      void queryClient.invalidateQueries({
        queryKey: jarvisEventsQueryKey(params.owner, params.accountId),
      });
    },
  });
}

/** Subscribe to live Jarvis events over Socket.IO. */
export function useJarvisLive(
  owner: string | null | undefined,
  accountId: string | null | undefined,
  enabled = true,
) {
  return useJarvisWebSocket({
    owner: owner ?? undefined,
    accountId: accountId ?? undefined,
    enabled: Boolean(enabled && owner && accountId),
  });
}

export type {
  JarvisEventRecord,
  JarvisGuardrails,
  JarvisSettingsResponse,
  JarvisStatusResponse,
};
export type { JarvisConnectionState } from "@/hooks/useJarvisWebSocket";
