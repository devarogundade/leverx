/** Mirrors `indexer/crates/leverx-schema/src/models.rs` and leverx-server JSON. */

export type Paginated<T> = {
  items: T[];
  limit: number;
  offset: number;
  has_more: boolean;
};

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
};

export type UserProxy = {
  account_id: string;
  owner: string;
  predict_manager_id: string | null;
  borrowed_quote: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type PositionTrigger = {
  account_id: string;
  oracle_id: string;
  is_range: boolean;
  take_profit_premium: number;
  stop_loss_premium: number;
  active: boolean;
  updated_at_ms: number;
};

/** @deprecated Use `PositionTrigger` */
export type TriggerState = PositionTrigger;

export type ProtocolSettings = {
  registry_id: string;
  vault_id: string | null;
  predict_id: string | null;
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
  /** `liquidation` | `force_deleverage` | `bad_debt` */
  event_kind: string;
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
