use diesel::prelude::*;
use serde::Serialize;
use serde_json::Value as JsonValue;
use sui_field_count::FieldCount;

use crate::schema::{
    account_timeline, global_market_trades, leverx_events, limit_mint_orders, leveraged_positions,
    liquidations, market_trades, markets, position_triggers, predict_managers, protocol_settings,
    proxy_executors, user_points, user_proxies, vault_snapshots,
};

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = markets)]
pub struct MarketRow {
    pub market_key: String,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub first_seen_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = markets)]
pub struct NewMarket {
    pub market_key: String,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub first_seen_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = predict_managers)]
pub struct PredictManagerRow {
    pub manager_id: String,
    pub owner: Option<String>,
    pub account_id: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = predict_managers)]
pub struct NewPredictManager {
    pub manager_id: String,
    pub owner: Option<String>,
    pub account_id: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = leverx_events)]
pub struct NewLeverxEvent {
    pub event_digest: String,
    pub event_type: String,
    pub module: String,
    pub package_id: String,
    pub transaction_digest: String,
    pub checkpoint: i64,
    pub timestamp_ms: i64,
    pub parsed_json: JsonValue,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = user_proxies)]
pub struct UserProxyRow {
    pub account_id: String,
    pub owner: String,
    pub predict_manager_id: Option<String>,
    pub borrowed_quote: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = user_proxies)]
pub struct NewUserProxy {
    pub account_id: String,
    pub owner: String,
    pub predict_manager_id: Option<String>,
    pub borrowed_quote: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = limit_mint_orders)]
pub struct LimitMintOrderRow {
    pub placed_event_digest: String,
    pub position_key: String,
    pub account_id: String,
    pub owner: String,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_range: bool,
    pub is_up: bool,
    pub limit_premium_per_unit: i64,
    pub slippage_bps: i64,
    pub market_ask_at_place: Option<i64>,
    pub margin_quote: i64,
    pub leverage_bps: i64,
    pub quantity: i64,
    pub order_expires_ms: i64,
    pub status: String,
    pub placed_at_ms: i64,
    pub placed_by: Option<String>,
    pub executed_event_digest: Option<String>,
    pub filled_at_ms: Option<i64>,
    pub market_ask_at_fill: Option<i64>,
    pub mint_cost: Option<i64>,
    pub executor: Option<String>,
    pub cancelled_event_digest: Option<String>,
    pub cancelled_at_ms: Option<i64>,
    pub cancelled_by: Option<String>,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = limit_mint_orders)]
pub struct NewLimitMintOrder {
    pub placed_event_digest: String,
    pub position_key: String,
    pub account_id: String,
    pub owner: String,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_range: bool,
    pub is_up: bool,
    pub limit_premium_per_unit: i64,
    pub slippage_bps: i64,
    pub market_ask_at_place: Option<i64>,
    pub margin_quote: i64,
    pub leverage_bps: i64,
    pub quantity: i64,
    pub order_expires_ms: i64,
    pub status: String,
    pub placed_at_ms: i64,
    pub placed_by: Option<String>,
    pub executed_event_digest: Option<String>,
    pub filled_at_ms: Option<i64>,
    pub market_ask_at_fill: Option<i64>,
    pub mint_cost: Option<i64>,
    pub executor: Option<String>,
    pub cancelled_event_digest: Option<String>,
    pub cancelled_at_ms: Option<i64>,
    pub cancelled_by: Option<String>,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = leveraged_positions)]
pub struct LeveragedPositionRow {
    pub position_key: String,
    pub account_id: String,
    pub owner: String,
    pub predict_manager_id: Option<String>,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub open_quantity: i64,
    pub margin_quote: i64,
    pub borrow_quote: i64,
    pub peak_borrow_quote: i64,
    pub leverage_bps: i64,
    pub mint_cost: i64,
    pub last_order_type: Option<i16>,
    pub status: String,
    pub opened_at_ms: Option<i64>,
    pub closed_at_ms: Option<i64>,
    pub realized_payout: i64,
    pub entry_mark: Option<i64>,
    pub closing_mark: Option<i64>,
    pub close_debt_repaid: i64,
    pub close_interest_paid: i64,
    pub close_surplus_quote: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = leverx_events)]
pub struct LeverxEventRow {
    pub event_digest: String,
    pub event_type: String,
    pub module: String,
    pub package_id: String,
    pub transaction_digest: String,
    pub checkpoint: i64,
    pub timestamp_ms: i64,
    pub parsed_json: JsonValue,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = vault_snapshots)]
pub struct VaultSnapshotRow {
    pub event_digest: String,
    pub vault_id: String,
    pub event_type: String,
    pub timestamp_ms: i64,
    pub nav: Option<i64>,
    pub utilization_bps: Option<i64>,
    pub total_borrowed: Option<i64>,
    pub borrow_rate_bps: Option<i64>,
    pub lp_apr_bps: Option<i64>,
    pub amount: Option<i64>,
    pub account_id: Option<String>,
    pub owner: Option<String>,
    pub payload: JsonValue,
    pub insurance_fund_delta: Option<i64>,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = protocol_settings)]
pub struct ProtocolSettingsRow {
    pub registry_id: String,
    pub vault_id: Option<String>,
    pub predict_id: Option<String>,
    pub fee_collector_id: Option<String>,
    pub trading_paused: bool,
    pub base_rate_bps: Option<i64>,
    pub kink_utilization_bps: Option<i64>,
    pub slope1_bps: Option<i64>,
    pub slope2_bps: Option<i64>,
    pub flash_fee_bps: Option<i64>,
    pub liquidation_bps: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = position_triggers)]
pub struct PositionTriggerRow {
    pub account_id: String,
    pub oracle_id: String,
    pub is_range: bool,
    pub take_profit_premium: i64,
    pub stop_loss_premium: i64,
    pub take_profit_slippage_bps: i64,
    pub stop_loss_slippage_bps: i64,
    pub active: bool,
    pub updated_at_ms: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = proxy_executors)]
pub struct ProxyExecutorRow {
    pub account_id: String,
    pub executor: String,
    pub active: bool,
    pub registered_at_ms: i64,
    pub revoked_at_ms: Option<i64>,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = liquidations)]
pub struct LiquidationRow {
    pub event_digest: String,
    pub position_key: String,
    pub account_id: String,
    pub owner: String,
    pub keeper: String,
    pub debt_repaid: i64,
    pub surplus_quote: i64,
    pub health_bps: i64,
    pub had_position_redeem: bool,
    pub timestamp_ms: i64,
    pub event_kind: String,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = account_timeline)]
pub struct AccountTimelineRow {
    pub event_digest: String,
    pub account_id: String,
    pub owner: Option<String>,
    pub event_type: String,
    pub timestamp_ms: i64,
    pub payload: JsonValue,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = leveraged_positions)]
pub struct NewLeveragedPosition {
    pub position_key: String,
    pub account_id: String,
    pub owner: String,
    pub predict_manager_id: Option<String>,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub open_quantity: i64,
    pub margin_quote: i64,
    pub borrow_quote: i64,
    pub peak_borrow_quote: i64,
    pub leverage_bps: i64,
    pub mint_cost: i64,
    pub last_order_type: Option<i16>,
    pub status: String,
    pub opened_at_ms: Option<i64>,
    pub closed_at_ms: Option<i64>,
    pub realized_payout: i64,
    pub entry_mark: Option<i64>,
    pub closing_mark: Option<i64>,
    pub close_debt_repaid: i64,
    pub close_interest_paid: i64,
    pub close_surplus_quote: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = market_trades)]
pub struct MarketTradeRow {
    pub event_digest: String,
    pub position_key: String,
    pub oracle_id: String,
    pub trade_kind: String,
    pub side: String,
    pub quantity: i64,
    pub premium_per_unit: Option<i64>,
    pub notional_quote: Option<i64>,
    pub account_id: Option<String>,
    pub owner: Option<String>,
    pub order_type: Option<i16>,
    pub timestamp_ms: i64,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = global_market_trades)]
pub struct GlobalMarketTradeRow {
    pub event_digest: String,
    pub event_type: String,
    pub predict_id: String,
    pub manager_id: String,
    pub market_key: String,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub quote_asset: String,
    pub trade_side: String,
    pub quantity: i64,
    pub cost: Option<i64>,
    pub payout: Option<i64>,
    pub ask_price: Option<i64>,
    pub bid_price: Option<i64>,
    pub trader: Option<String>,
    pub owner: Option<String>,
    pub executor: Option<String>,
    pub is_settled: Option<bool>,
    pub timestamp_ms: i64,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = global_market_trades)]
pub struct NewGlobalMarketTrade {
    pub event_digest: String,
    pub event_type: String,
    pub predict_id: String,
    pub manager_id: String,
    pub market_key: String,
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub quote_asset: String,
    pub trade_side: String,
    pub quantity: i64,
    pub cost: Option<i64>,
    pub payout: Option<i64>,
    pub ask_price: Option<i64>,
    pub bid_price: Option<i64>,
    pub trader: Option<String>,
    pub owner: Option<String>,
    pub executor: Option<String>,
    pub is_settled: Option<bool>,
    pub timestamp_ms: i64,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = market_trades)]
pub struct NewMarketTrade {
    pub event_digest: String,
    pub position_key: String,
    pub oracle_id: String,
    pub trade_kind: String,
    pub side: String,
    pub quantity: i64,
    pub premium_per_unit: Option<i64>,
    pub notional_quote: Option<i64>,
    pub account_id: Option<String>,
    pub owner: Option<String>,
    pub order_type: Option<i16>,
    pub timestamp_ms: i64,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = vault_snapshots)]
pub struct NewVaultSnapshot {
    pub event_digest: String,
    pub vault_id: String,
    pub event_type: String,
    pub timestamp_ms: i64,
    pub nav: Option<i64>,
    pub utilization_bps: Option<i64>,
    pub total_borrowed: Option<i64>,
    pub borrow_rate_bps: Option<i64>,
    pub lp_apr_bps: Option<i64>,
    pub amount: Option<i64>,
    pub account_id: Option<String>,
    pub owner: Option<String>,
    pub payload: JsonValue,
    pub insurance_fund_delta: Option<i64>,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = protocol_settings)]
pub struct NewProtocolSettings {
    pub registry_id: String,
    pub vault_id: Option<String>,
    pub predict_id: Option<String>,
    pub fee_collector_id: Option<String>,
    pub trading_paused: bool,
    pub base_rate_bps: Option<i64>,
    pub kink_utilization_bps: Option<i64>,
    pub slope1_bps: Option<i64>,
    pub slope2_bps: Option<i64>,
    pub flash_fee_bps: Option<i64>,
    pub liquidation_bps: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = position_triggers)]
pub struct NewPositionTrigger {
    pub account_id: String,
    pub oracle_id: String,
    pub is_range: bool,
    pub take_profit_premium: i64,
    pub stop_loss_premium: i64,
    pub take_profit_slippage_bps: i64,
    pub stop_loss_slippage_bps: i64,
    pub active: bool,
    pub updated_at_ms: i64,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = proxy_executors)]
pub struct NewProxyExecutor {
    pub account_id: String,
    pub executor: String,
    pub active: bool,
    pub registered_at_ms: i64,
    pub revoked_at_ms: Option<i64>,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = liquidations)]
pub struct NewLiquidation {
    pub event_digest: String,
    pub position_key: String,
    pub account_id: String,
    pub owner: String,
    pub keeper: String,
    pub debt_repaid: i64,
    pub surplus_quote: i64,
    pub health_bps: i64,
    pub had_position_redeem: bool,
    pub timestamp_ms: i64,
    pub event_kind: String,
}

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = user_points)]
pub struct UserPointsRow {
    pub owner: String,
    pub account_id: Option<String>,
    pub volume_quote: i64,
    pub trade_count: i64,
    pub points: i64,
    pub first_trade_at_ms: Option<i64>,
    pub last_trade_at_ms: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Insertable, AsChangeset, Debug, Clone, FieldCount)]
#[diesel(table_name = user_points)]
pub struct NewUserPoints {
    pub owner: String,
    pub account_id: Option<String>,
    pub volume_quote: i64,
    pub trade_count: i64,
    pub points: i64,
    pub first_trade_at_ms: Option<i64>,
    pub last_trade_at_ms: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Insertable, Debug, Clone, FieldCount)]
#[diesel(table_name = account_timeline)]
pub struct NewAccountTimeline {
    pub event_digest: String,
    pub account_id: String,
    pub owner: Option<String>,
    pub event_type: String,
    pub timestamp_ms: i64,
    pub payload: JsonValue,
}
