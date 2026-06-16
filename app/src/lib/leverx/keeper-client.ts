import { z } from "zod";
import { appConfig } from "@/lib/config";
import type { SignedManagerCreateIntent } from "@/lib/leverx/manager-intent-auth";
import type { SignedTradeIntent } from "@/lib/leverx/trade-intent-auth";
import { KEEPER_API_KEY_HEADER } from "@/lib/leverx/keeper-headers";
import {
  JarvisEventRecordSchema,
  JarvisGuardrailsSchema,
  JarvisMarkReadResponseSchema,
  JarvisSettingsResponseSchema,
  JarvisStatusResponseSchema,
  JarvisUpdateSettingsBodySchema,
  type JarvisEventRecord,
  type JarvisEventType,
  type JarvisGuardrails,
  type JarvisSettingsResponse,
  type JarvisStatusResponse,
  type JarvisUpdateSettingsBody,
} from "@/lib/leverx/jarvis-schemas";

export type {
  JarvisEventRecord,
  JarvisEventType,
  JarvisGuardrails,
  JarvisSettingsResponse,
  JarvisStatusResponse,
  JarvisUpdateSettingsBody,
};

function normalizeJarvisOwner(owner: string): string {
  return owner.trim().toLowerCase();
}

function normalizeJarvisAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export type ManagerApiResponse = {
  address: string;
  manager_id: string | null;
  created?: boolean;
};

export type TradeRelayResponse = {
  digest: string;
};

export type GasSponsorResponse = {
  bytes: string;
  digest: string;
};

export type GasExecuteResponse = {
  digest: string;
};

export type KeeperHealthResponse = {
  ok: boolean;
  service: "keeper";
  uptimeSec?: number;
};

function keeperApiBase(): string {
  return appConfig.keeperApiUrl.replace(/\/$/, "");
}

export async function fetchKeeperHealth(): Promise<KeeperHealthResponse> {
  const res = await fetch(`${keeperApiBase()}/health`);
  if (!res.ok) {
    return { ok: false, service: "keeper" };
  }
  return res.json() as Promise<KeeperHealthResponse>;
}

function keeperHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = appConfig.keeperApiKey?.trim();
  if (apiKey) headers[KEEPER_API_KEY_HEADER] = apiKey;
  return headers;
}

async function postKeeper<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${keeperApiBase()}${path}`, {
    method: "POST",
    headers: keeperHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path}_failed:${res.status}${detail ? `:${detail.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function patchKeeper<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${keeperApiBase()}${path}`, {
    method: "PATCH",
    headers: keeperHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path}_failed:${res.status}${detail ? `:${detail.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchUserPredictManager(
  userAddress: string,
): Promise<string | null> {
  const res = await fetch(
    `${keeperApiBase()}/manager/${encodeURIComponent(userAddress)}`,
  );
  if (!res.ok) {
    throw new Error(`manager_lookup_failed:${res.status}`);
  }
  const body = (await res.json()) as ManagerApiResponse;
  return body.manager_id;
}

/** Create or return the keeper-owned Predict manager for a user wallet. */
export async function ensureUserPredictManager(
  payload: SignedManagerCreateIntent,
): Promise<string> {
  const res = await fetch(`${keeperApiBase()}/create-manager`, {
    method: "POST",
    headers: keeperHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`manager_create_failed:${res.status}`);
  }
  const body = (await res.json()) as ManagerApiResponse;
  if (!body.manager_id) {
    throw new Error("manager_create_empty");
  }
  return body.manager_id;
}

/** Relay a signed market mint intent — keeper builds and executes the PTB. */
export async function relayTradeMint(payload: SignedTradeIntent): Promise<TradeRelayResponse> {
  return postKeeper<TradeRelayResponse>("/trade/mint", payload);
}

/** Relay a signed market redeem intent — keeper builds and executes the PTB. */
export async function relayTradeRedeem(payload: SignedTradeIntent): Promise<TradeRelayResponse> {
  return postKeeper<TradeRelayResponse>("/trade/redeem", payload);
}

/** Relay a signed settle intent for an expired position — keeper builds and executes the PTB. */
export async function relayTradeSettle(payload: SignedTradeIntent): Promise<TradeRelayResponse> {
  return postKeeper<TradeRelayResponse>("/trade/settle", payload);
}

/** Enoki sponsor step — keeper uses ENOKI_SECRET_KEY; user signs returned bytes. */
export async function keeperCreateSponsoredTransaction(body: {
  sender: string;
  transactionKindBytes: string;
}): Promise<GasSponsorResponse> {
  return postKeeper<GasSponsorResponse>("/gas/sponsor", body);
}

/** Enoki execute step — submit user signature for a sponsored PTB. */
export async function keeperExecuteSponsoredTransaction(body: {
  digest: string;
  signature: string;
}): Promise<GasExecuteResponse> {
  return postKeeper<GasExecuteResponse>("/gas/sponsor/execute", body);
}

export type TelegramLinkTokenResponse = {
  bot_username: string;
  start_payload: string;
  deep_link: string;
  expires_at_ms: number;
};

export type TelegramSubscriptionStatus = {
  enabled: boolean;
  bot_username: string | null;
  subscribed: boolean;
  subscriptions: Array<{
    chat_id: string;
    account_id: string;
    owner: string;
    subscribed_at_ms: number;
    telegram_username?: string | null;
  }>;
};

export async function fetchTelegramSubscription(params: {
  owner: string;
  accountId: string;
}): Promise<TelegramSubscriptionStatus> {
  const q = new URLSearchParams({
    owner: params.owner,
    account_id: params.accountId,
  });
  const res = await fetch(`${keeperApiBase()}/telegram/subscription?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`telegram_subscription_failed:${res.status}`);
  }
  return res.json() as Promise<TelegramSubscriptionStatus>;
}

export async function createTelegramLinkToken(params: {
  owner: string;
  accountId: string;
}): Promise<TelegramLinkTokenResponse> {
  return postKeeper<TelegramLinkTokenResponse>("/telegram/link-token", {
    owner: params.owner,
    account_id: params.accountId,
  });
}

export type TelegramOtpResponse = {
  code: string;
  expires_at_ms: number;
};

export type TelegramTradingSessionStatus = {
  enabled: boolean;
  bot_username: string | null;
  active: boolean;
  expires_at_ms: number | null;
  chat_id: string | null;
  telegram_username: string | null;
  active_oracle_id: string | null;
};

export async function fetchTelegramTradingSession(params: {
  owner: string;
  accountId: string;
}): Promise<TelegramTradingSessionStatus> {
  const q = new URLSearchParams({
    owner: params.owner,
    account_id: params.accountId,
  });
  const res = await fetch(`${keeperApiBase()}/telegram/auth/session?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`telegram_session_failed:${res.status}`);
  }
  return res.json() as Promise<TelegramTradingSessionStatus>;
}

export async function createTelegramTradingOtp(params: {
  owner: string;
  accountId: string;
}): Promise<TelegramOtpResponse> {
  return postKeeper<TelegramOtpResponse>("/telegram/auth/otp", {
    owner: params.owner,
    account_id: params.accountId,
  });
}

export async function revokeTelegramTradingSession(params: {
  owner: string;
  accountId: string;
}): Promise<{ revoked: number }> {
  const res = await fetch(`${keeperApiBase()}/telegram/auth/session`, {
    method: "DELETE",
    headers: keeperHeaders(),
    body: JSON.stringify({
      owner: params.owner,
      account_id: params.accountId,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `telegram_revoke_failed:${res.status}${detail ? `:${detail.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<{ revoked: number }>;
}

export async function fetchJarvisStatus(params: {
  owner: string;
  accountId: string;
}): Promise<JarvisStatusResponse> {
  const owner = normalizeJarvisOwner(params.owner);
  const accountId = normalizeJarvisAccountId(params.accountId);
  const q = new URLSearchParams({
    owner,
    account_id: accountId,
  });
  const res = await fetch(`${keeperApiBase()}/jarvis/status?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`jarvis_status_failed:${res.status}`);
  }
  return JarvisStatusResponseSchema.parse(await res.json());
}

export async function enableJarvis(params: {
  owner: string;
  accountId: string;
}): Promise<JarvisStatusResponse> {
  const result = await postKeeper<unknown>("/jarvis/enable", {
    owner: normalizeJarvisOwner(params.owner),
    account_id: normalizeJarvisAccountId(params.accountId),
  });
  return JarvisStatusResponseSchema.parse(result);
}

export async function disableJarvis(params: {
  owner: string;
  accountId: string;
}): Promise<JarvisStatusResponse> {
  const result = await postKeeper<unknown>("/jarvis/disable", {
    owner: normalizeJarvisOwner(params.owner),
    account_id: normalizeJarvisAccountId(params.accountId),
  });
  return JarvisStatusResponseSchema.parse(result);
}

export async function fetchJarvisEvents(params: {
  owner: string;
  accountId: string;
  limit?: number;
  beforeMs?: number;
}): Promise<JarvisEventRecord[]> {
  const owner = normalizeJarvisOwner(params.owner);
  const accountId = normalizeJarvisAccountId(params.accountId);
  const q = new URLSearchParams({
    owner,
    account_id: accountId,
    limit: String(params.limit ?? 50),
  });
  if (params.beforeMs != null && params.beforeMs > 0) {
    q.set("before_ms", String(params.beforeMs));
  }
  const res = await fetch(`${keeperApiBase()}/jarvis/events?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`jarvis_events_failed:${res.status}`);
  }
  const body = await res.json();
  return z.array(JarvisEventRecordSchema).parse(body);
}

export async function markJarvisEventsRead(params: {
  owner: string;
  accountId: string;
  eventIds?: string[];
}): Promise<{ updated: number }> {
  const result = await postKeeper<unknown>("/jarvis/events/read", {
    owner: normalizeJarvisOwner(params.owner),
    account_id: normalizeJarvisAccountId(params.accountId),
    event_ids: params.eventIds,
  });
  return JarvisMarkReadResponseSchema.parse(result);
}

export async function fetchJarvisSettings(params: {
  owner: string;
  accountId: string;
}): Promise<JarvisSettingsResponse> {
  const owner = normalizeJarvisOwner(params.owner);
  const accountId = normalizeJarvisAccountId(params.accountId);
  const q = new URLSearchParams({ owner, account_id: accountId });
  const res = await fetch(`${keeperApiBase()}/jarvis/settings?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`jarvis_settings_failed:${res.status}`);
  }
  return JarvisSettingsResponseSchema.parse(await res.json());
}

export async function updateJarvisSettings(
  body: JarvisUpdateSettingsBody,
): Promise<JarvisSettingsResponse> {
  const parsed = JarvisUpdateSettingsBodySchema.parse({
    ...body,
    owner: normalizeJarvisOwner(body.owner),
    account_id: normalizeJarvisAccountId(body.account_id),
  });
  const result = await patchKeeper<unknown>("/jarvis/settings", parsed);
  return JarvisSettingsResponseSchema.parse(result);
}

export const JARVIS_DEFAULT_GUARDRAILS: JarvisGuardrails = JarvisGuardrailsSchema.parse({
  max_leverage: 5,
  max_portfolio_pct: 20,
  max_open_positions: 3,
  risk_profile: "balanced",
  dry_run: false,
});
