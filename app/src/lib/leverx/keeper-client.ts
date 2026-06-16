import { appConfig } from "@/lib/config";
import type { SignedManagerCreateIntent } from "@/lib/leverx/manager-intent-auth";
import type { SignedTradeIntent } from "@/lib/leverx/trade-intent-auth";
import { KEEPER_API_KEY_HEADER } from "@/lib/leverx/keeper-headers";

export type ManagerApiResponse = {
  address: string;
  manager_id: string | null;
  created?: boolean;
};

export type TradeRelayResponse = {
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
