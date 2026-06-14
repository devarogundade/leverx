/**
 * LeverX indexer HTTP client — structured on-chain projections.
 */

const INDEXER_URL =
  import.meta.env.VITE_LEVERX_INDEXER_URL ?? "http://localhost:3100";

export type OrderBookLevel = {
  price: number;
  size: number;
  total: number;
};

export type OrderBookResponse = {
  oracle_id: string;
  expiry_ms: number;
  strike: number;
  higher_strike: number;
  is_up: boolean;
  is_range: boolean;
  last_traded_premium: number | null;
  spread_bps: number | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  ask_share_pct: number;
  bid_share_pct: number;
  updated_at_ms: number;
};

export type MarketCatalogEntry = {
  market_key: string;
  oracle_id: string;
  expiry_ms: number;
  strike: number;
  higher_strike: number;
  is_up: boolean;
  is_range: boolean;
  last_ask_price: number | null;
  last_bid_price: number | null;
  volume_24h: number;
  trade_count_24h: number;
  updated_at_ms: number;
};

export type Paginated<T> = {
  items: T[];
  limit: number;
  offset: number;
  has_more: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  owner: string;
  account_id: string | null;
  volume_quote: number;
  trade_count: number;
  points: number;
  first_trade_at_ms: number | null;
  last_trade_at_ms: number | null;
};

export type LimitMintOrder = {
  placed_event_digest: string;
  position_key: string;
  account_id: string;
  owner: string;
  oracle_id: string;
  expiry_ms: number;
  strike: number;
  higher_strike: number;
  is_range: boolean;
  is_up: boolean;
  limit_premium_per_unit: number;
  slippage_bps: number;
  market_ask_at_place: number | null;
  margin_quote: number;
  leverage_bps: number;
  quantity: number;
  order_expires_ms: number;
  status: string;
  placed_at_ms: number;
  placed_by: string | null;
  executed_event_digest: string | null;
  filled_at_ms: number | null;
  market_ask_at_fill: number | null;
  mint_cost: number | null;
  executor: string | null;
  cancelled_event_digest: string | null;
  cancelled_at_ms: number | null;
  cancelled_by: string | null;
};

export type LeveragedPosition = {
  position_key: string;
  account_id: string;
  owner: string;
  predict_manager_id: string | null;
  oracle_id: string;
  expiry_ms: number;
  strike: number;
  higher_strike: number;
  is_up: boolean;
  is_range: boolean;
  open_quantity: number;
  margin_quote: number;
  borrow_quote: number;
  leverage_bps: number;
  mint_cost: number;
  last_order_type: number | null;
  status: string;
  opened_at_ms: number | null;
  closed_at_ms: number | null;
  realized_payout: number;
  entry_mark: number | null;
  closing_mark: number | null;
  close_debt_repaid: number;
  close_interest_paid: number;
  close_surplus_quote: number;
};

export type UserProxy = {
  account_id: string;
  owner: string;
  predict_manager_id: string | null;
  borrowed_quote: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type MarketTrade = {
  event_digest: string;
  position_key: string;
  oracle_id: string;
  trade_kind: string;
  side: string;
  quantity: number;
  premium_per_unit: number | null;
  notional_quote: number | null;
  account_id: string | null;
  owner: string | null;
  order_type: number | null;
  timestamp_ms: number;
};

export type GlobalMarketTrade = {
  event_digest: string;
  event_type: string;
  predict_id: string;
  manager_id: string;
  market_key: string;
  oracle_id: string;
  expiry_ms: number;
  strike: number;
  higher_strike: number;
  is_up: boolean;
  is_range: boolean;
  quote_asset: string;
  trade_side: "mint" | "redeem";
  quantity: number;
  cost: number | null;
  payout: number | null;
  ask_price: number | null;
  bid_price: number | null;
  trader: string | null;
  owner: string | null;
  executor: string | null;
  is_settled: boolean | null;
  timestamp_ms: number;
};

export type VaultSnapshot = {
  event_digest: string;
  vault_id: string;
  event_type: string;
  timestamp_ms: number;
  nav: number | null;
  utilization_bps: number | null;
  total_borrowed: number | null;
  borrow_rate_bps: number | null;
  lp_apr_bps: number | null;
  amount: number | null;
  account_id: string | null;
  owner: string | null;
  payload: Record<string, unknown>;
  insurance_fund_delta: number | null;
};

export type ProtocolSettings = {
  registry_id: string;
  vault_id: string | null;
  predict_id: string | null;
  /** Canonical LeverX package (indexer or on-chain resolution). */
  package_id?: string | null;
  /** Canonical DeepBook Predict package. */
  predict_package_id?: string | null;
  fee_collector_id: string | null;
  trading_paused: boolean;
  base_rate_bps: number | null;
  kink_utilization_bps: number | null;
  slope1_bps: number | null;
  slope2_bps: number | null;
  flash_fee_bps: number | null;
  liquidation_bps: number | null;
  updated_at_ms: number;
};

export type PositionTrigger = {
  account_id: string;
  oracle_id: string;
  is_range: boolean;
  take_profit_premium: number;
  stop_loss_premium: number;
  take_profit_slippage_bps: number;
  stop_loss_slippage_bps: number;
  active: boolean;
  updated_at_ms: number;
};

export type ProxyExecutor = {
  account_id: string;
  executor: string;
  active: boolean;
  registered_at_ms: number;
  revoked_at_ms: number | null;
};

export type LiquidationEventKind = "liquidation" | "force_deleverage" | "bad_debt";

export type Liquidation = {
  event_digest: string;
  position_key: string;
  account_id: string;
  owner: string;
  keeper: string;
  debt_repaid: number;
  surplus_quote: number;
  health_bps: number;
  had_position_redeem: boolean;
  timestamp_ms: number;
  event_kind: LiquidationEventKind | string;
};

export type AccountTimelineEntry = {
  event_digest: string;
  account_id: string;
  owner: string | null;
  event_type: string;
  timestamp_ms: number;
  payload: Record<string, unknown>;
};

export type LeverxEvent = {
  event_digest: string;
  event_type: string;
  module: string;
  package_id: string;
  transaction_digest: string;
  checkpoint: number;
  timestamp_ms: number;
  parsed_json: Record<string, unknown>;
};

function buildQuery(
  args?: Record<string, string | number | boolean | undefined>,
): string {
  const q = new URLSearchParams();
  if (!args) return "";
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEXER_URL}${path}`);
  if (!res.ok) {
    throw new Error(`indexer ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function fetchOrderBook(args: {
  oracleId: string;
  expiryMs: number;
  strike: number;
  higherStrike?: number;
  isUp?: boolean;
  isRange?: boolean;
}): Promise<OrderBookResponse> {
  return get(
    `/v1/orderbook${buildQuery({
      oracle_id: args.oracleId,
      expiry_ms: args.expiryMs,
      strike: args.strike,
      higher_strike: args.higherStrike,
      is_up: args.isUp ?? true,
      is_range: args.isRange ?? false,
    })}`,
  );
}

export function fetchMarketCatalog(args?: {
  oracleId?: string;
  isRange?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Paginated<MarketCatalogEntry>> {
  return get(
    `/v1/markets/catalog${buildQuery({
      oracle_id: args?.oracleId,
      is_range: args?.isRange,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchLimitOrders(args?: {
  accountId?: string;
  owner?: string;
  status?: string;
  oracleId?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<LimitMintOrder>> {
  return get(
    `/v1/limit-orders${buildQuery({
      account_id: args?.accountId,
      owner: args?.owner,
      status: args?.status,
      oracle_id: args?.oracleId,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchPositions(args?: {
  owner?: string;
  accountId?: string;
  oracleId?: string;
  status?: string;
  /** Exclude rows with this status (indexer supports comma-separated values). */
  excludeStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<LeveragedPosition>> {
  return get(
    `/v1/positions${buildQuery({
      owner: args?.owner,
      account_id: args?.accountId,
      oracle_id: args?.oracleId,
      status: args?.status,
      exclude_status: args?.excludeStatus,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchAccounts(args?: {
  owner?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<UserProxy>> {
  return get(
    `/v1/accounts${buildQuery({
      owner: args?.owner,
      account_id: args?.accountId,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchMarketTrades(
  oracleId: string,
  limit = 50,
  offset = 0,
): Promise<Paginated<MarketTrade>> {
  return get(
    `/v1/markets/${oracleId}/trades${buildQuery({ limit, offset })}`,
  );
}

export function fetchGlobalMarketTrades(
  oracleId: string,
  args?: {
    tradeSide?: "mint" | "redeem";
    isRange?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<Paginated<GlobalMarketTrade>> {
  return get(
    `/v1/global-markets/${oracleId}/trades${buildQuery({
      trade_side: args?.tradeSide,
      is_range: args?.isRange,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchAccount(accountId: string) {
  return get<{
    account: UserProxy | null;
    open_positions: LeveragedPosition[];
    open_limit_orders: LimitMintOrder[];
  }>(`/v1/accounts/${accountId}`);
}

export function fetchAccountTimeline(
  accountId: string,
  limit = 50,
  offset = 0,
): Promise<Paginated<AccountTimelineEntry>> {
  return get(
    `/v1/accounts/${accountId}/timeline${buildQuery({ limit, offset })}`,
  );
}

export function fetchVaultSummary(vaultId: string) {
  return get<{ snapshot: VaultSnapshot | null }>(`/v1/vault/${vaultId}/summary`);
}

export function fetchVaultHistory(
  vaultId: string,
  limit = 50,
  offset = 0,
): Promise<Paginated<VaultSnapshot>> {
  return get(
    `/v1/vault/${vaultId}/history${buildQuery({ limit, offset })}`,
  );
}

export function fetchEvents(args?: {
  eventType?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<LeverxEvent>> {
  return get(
    `/v1/events${buildQuery({
      event_type: args?.eventType,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchHealth() {
  return get<{ ok: boolean; service: string }>("/health");
}

export function fetchProtocolSettings(): Promise<ProtocolSettings | null> {
  return get("/v1/protocol");
}

export function fetchTriggers(args?: {
  accountId?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<PositionTrigger>> {
  return get(
    `/v1/triggers${buildQuery({
      account_id: args?.accountId,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchExecutors(args?: {
  accountId?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<ProxyExecutor>> {
  return get(
    `/v1/executors${buildQuery({
      account_id: args?.accountId,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchLiquidations(args?: {
  accountId?: string;
  owner?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<Liquidation>> {
  return get(
    `/v1/liquidations${buildQuery({
      account_id: args?.accountId,
      owner: args?.owner,
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchPointsLeaderboard(args?: {
  limit?: number;
  offset?: number;
}): Promise<Paginated<LeaderboardEntry>> {
  return get(
    `/v1/points/leaderboard${buildQuery({
      limit: args?.limit,
      offset: args?.offset,
    })}`,
  );
}

export function fetchPointsForOwner(
  owner: string,
): Promise<{ entry: LeaderboardEntry | null }> {
  return get(`/v1/points/${encodeURIComponent(owner)}`);
}
