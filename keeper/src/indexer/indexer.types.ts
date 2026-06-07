export type Paginated<T> = {
  items: T[];
  limit: number;
  offset: number;
  has_more: boolean;
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
  collateral_asset: string;
  open_quantity: number;
  margin_quote: number;
  borrow_quote: number;
  leverage_bps: number;
  mint_cost: number;
  status: string;
  opened_at_ms: number | null;
  closed_at_ms: number | null;
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
  collateral_asset: string;
  limit_premium_per_unit: number;
  slippage_bps: number;
  market_ask_at_place: number | null;
  margin_quote: number;
  leverage_bps: number;
  quantity: number;
  order_expires_ms: number;
  status: string;
  placed_at_ms: number;
};

export type UserProxy = {
  account_id: string;
  owner: string;
  predict_manager_id: string | null;
  borrowed_quote: number;
};

export type OrderBookResponse = {
  oracle_id: string;
  asks: { price: number; size: number }[];
  bids: { price: number; size: number }[];
  updated_at_ms: number;
};

export type LeverxEvent = {
  event_digest: string;
  event_type: string;
  timestamp_ms: number;
  parsed_json: Record<string, unknown>;
};

export type TriggerState = {
  account_id: string;
  oracle_id: string;
  is_range: boolean;
  take_profit_premium: number;
  stop_loss_premium: number;
  active: boolean;
  updated_at_ms: number;
};
