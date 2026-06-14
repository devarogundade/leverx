use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use diesel::prelude::*;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::RunQueryDsl;
use diesel_async::AsyncPgConnection;
use leverx_schema::models::{
    AccountTimelineRow, LeveragedPositionRow, LeverxEventRow,
    LimitMintOrderRow, LiquidationRow, MarketTradeRow, PositionTriggerRow, ProtocolSettingsRow,
    ProxyExecutorRow, UserProxyRow, VaultSnapshotRow,
};
use leverx_schema::schema::{
    account_timeline, leveraged_positions, leverx_events, limit_mint_orders,
    liquidations, market_trades, position_triggers, protocol_settings, proxy_executors,
    user_proxies, vault_snapshots,
};
use serde::Deserialize;
use serde_json::json;

use crate::catalog::{catalog_response, fetch_market_catalog, parse_catalog_pagination};
use crate::global_trades::fetch_combined_global_trades;
use crate::leaderboard::{fetch_leaderboard, fetch_owner_rank, leaderboard_response, parse_leaderboard_pagination};
use crate::orderbook;
use crate::pagination::{paginate, parse_limit_offset};
use crate::vault::{merge_vault_snapshot, normalize_snapshot_row};
use crate::stream::StreamHub;
use crate::ws::ws_handler;

#[derive(Clone)]
pub struct AppState {
    pub pool: Pool<AsyncPgConnection>,
    pub stream: StreamHub,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/v1/ws", axum::routing::get(ws_handler))
        .route("/v1/orderbook", get(orderbook_handler))
        .route("/v1/limit-orders", get(limit_orders))
        .route("/v1/markets/catalog", get(market_catalog))
        .route("/v1/points/leaderboard", get(points_leaderboard))
        .route("/v1/points/{owner}", get(points_for_owner))
        .route("/v1/positions", get(positions))
        .route("/v1/accounts", get(accounts))
        .route("/v1/accounts/{account_id}", get(account_summary))
        .route("/v1/accounts/{account_id}/timeline", get(account_timeline))
        .route("/v1/vault/{vault_id}/summary", get(vault_summary))
        .route("/v1/vault/{vault_id}/history", get(vault_history))
        .route("/v1/markets/{oracle_id}/trades", get(market_trades))
        .route("/v1/global-markets/{oracle_id}/trades", get(global_market_trades))
        .route("/v1/events", get(events))
        .route("/v1/protocol", get(protocol_settings_handler))
        .route("/v1/triggers", get(triggers_list))
        .route("/v1/executors", get(executors_list))
        .route("/v1/liquidations", get(liquidations_list))
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let ok = state.pool.get().await.is_ok();
    Json(json!({ "ok": ok, "service": "leverx-server" }))
}

#[derive(Debug, Deserialize)]
struct OrderBookQuery {
    oracle_id: String,
    expiry_ms: i64,
    strike: i64,
    #[serde(default)]
    higher_strike: i64,
    #[serde(default = "default_true")]
    is_up: bool,
    #[serde(default)]
    is_range: bool,
}

fn default_true() -> bool {
    true
}

async fn orderbook_handler(
    State(state): State<AppState>,
    Query(q): Query<OrderBookQuery>,
) -> Result<Json<orderbook::OrderBookResponse>, StatusCode> {
    orderbook::build_orderbook(
        &state.pool,
        &q.oracle_id,
        q.expiry_ms,
        q.strike,
        q.higher_strike,
        q.is_up,
        q.is_range,
    )
    .await
    .map(Json)
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
    account_id: Option<String>,
    owner: Option<String>,
    status: Option<String>,
    oracle_id: Option<String>,
    event_type: Option<String>,
    /// When set, only rows with `borrow_quote >= min_borrow_quote` (keeper liquidation scans).
    min_borrow_quote: Option<i64>,
    /// When set, only rows with `open_quantity >= min_open_quantity` (keeper settlement/triggers).
    min_open_quantity: Option<i64>,
    /// When set, only rows with `expiry_ms <= max_expiry_ms` (keeper settlement scans).
    max_expiry_ms: Option<i64>,
    /// When true, only rows with a linked predict manager.
    has_predict_manager: Option<bool>,
    /// When true, only rows with `margin_quote > 0`.
    has_margin: Option<bool>,
    /// Comma-separated statuses to exclude (e.g. `liquidated`).
    exclude_status: Option<String>,
    /// When set, only limit orders with `order_expires_ms > min_order_expires_ms`.
    min_order_expires_ms: Option<i64>,
    /// When set, only limit orders with `order_expires_ms <= max_order_expires_ms` (keeper expiry).
    max_order_expires_ms: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct MarketCatalogQuery {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
    oracle_id: Option<String>,
    is_range: Option<bool>,
}

async fn market_catalog(
    State(state): State<AppState>,
    Query(q): Query<MarketCatalogQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_catalog_pagination(q.limit, q.offset);
    let rows = fetch_market_catalog(
        &state.pool,
        q.oracle_id.as_deref(),
        q.is_range,
        limit,
        offset,
    )
    .await?;
    Ok(Json(catalog_response(rows, limit, offset)))
}

#[derive(Debug, Deserialize)]
struct LeaderboardQuery {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

async fn points_leaderboard(
    State(state): State<AppState>,
    Query(q): Query<LeaderboardQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_leaderboard_pagination(q.limit, q.offset);
    let rows = fetch_leaderboard(&state.pool, limit, offset).await?;
    Ok(Json(leaderboard_response(rows, limit, offset)))
}

async fn points_for_owner(
    State(state): State<AppState>,
    Path(owner): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let row = fetch_owner_rank(&state.pool, &owner).await?;
    Ok(Json(json!({ "entry": row })))
}

async fn limit_orders(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = limit_mint_orders::table.into_boxed();
    if let Some(account_id) = &q.account_id {
        query = query.filter(limit_mint_orders::account_id.eq(account_id));
    }
    if let Some(owner) = &q.owner {
        query = query.filter(limit_mint_orders::owner.eq(owner));
    }
    if let Some(status) = &q.status {
        query = query.filter(limit_mint_orders::status.eq(status));
    }
    if let Some(oracle_id) = &q.oracle_id {
        query = query.filter(limit_mint_orders::oracle_id.eq(oracle_id));
    }
    if let Some(min_expires) = q.min_order_expires_ms {
        query = query.filter(limit_mint_orders::order_expires_ms.gt(min_expires));
    }
    if let Some(max_expires) = q.max_order_expires_ms {
        query = query.filter(limit_mint_orders::order_expires_ms.le(max_expires));
    }
    if q.has_margin == Some(true) {
        query = query.filter(limit_mint_orders::margin_quote.gt(0));
    }

    let rows = query
        .order(limit_mint_orders::placed_at_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(LimitMintOrderRow::as_select())
        .load::<LimitMintOrderRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn positions(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = leveraged_positions::table.into_boxed();
    if let Some(owner) = &q.owner {
        query = query.filter(leveraged_positions::owner.eq(owner));
    }
    if let Some(account_id) = &q.account_id {
        query = query.filter(leveraged_positions::account_id.eq(account_id));
    }
    if let Some(oracle_id) = &q.oracle_id {
        query = query.filter(leveraged_positions::oracle_id.eq(oracle_id));
    }
    match q.status.as_deref() {
        Some("all") => {}
        Some(status) => {
            query = query.filter(leveraged_positions::status.eq(status));
        }
        None => {
            query = query.filter(leveraged_positions::status.eq("open"));
        }
    }
    if let Some(min_borrow) = q.min_borrow_quote {
        query = query.filter(leveraged_positions::borrow_quote.ge(min_borrow));
    }
    if let Some(min_qty) = q.min_open_quantity {
        query = query.filter(leveraged_positions::open_quantity.ge(min_qty));
    }
    if let Some(max_expiry) = q.max_expiry_ms {
        query = query.filter(leveraged_positions::expiry_ms.le(max_expiry));
    }
    if q.has_predict_manager == Some(true) {
        query = query.filter(leveraged_positions::predict_manager_id.is_not_null());
    }
    if q.has_margin == Some(true) {
        query = query.filter(leveraged_positions::margin_quote.gt(0));
    }
    if let Some(exclude) = &q.exclude_status {
        for status in exclude.split(',') {
            let status = status.trim();
            if !status.is_empty() {
                query = query.filter(leveraged_positions::status.ne(status));
            }
        }
    }

    let rows = query
        .order(leveraged_positions::opened_at_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(LeveragedPositionRow::as_select())
        .load::<LeveragedPositionRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn accounts(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = user_proxies::table.into_boxed();
    if let Some(owner) = &q.owner {
        query = query.filter(user_proxies::owner.eq(owner));
    }
    if let Some(account_id) = &q.account_id {
        query = query.filter(user_proxies::account_id.eq(account_id));
    }

    let rows = query
        .order(user_proxies::updated_at_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(UserProxyRow::as_select())
        .load::<UserProxyRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn account_summary(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let account = user_proxies::table
        .filter(user_proxies::account_id.eq(&account_id))
        .select(UserProxyRow::as_select())
        .first::<UserProxyRow>(&mut conn)
        .await
        .optional()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let open_positions = leveraged_positions::table
        .filter(leveraged_positions::account_id.eq(&account_id))
        .filter(leveraged_positions::status.eq("open"))
        .select(LeveragedPositionRow::as_select())
        .load::<LeveragedPositionRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let open_limit_orders = limit_mint_orders::table
        .filter(limit_mint_orders::account_id.eq(&account_id))
        .filter(limit_mint_orders::status.eq("open"))
        .select(LimitMintOrderRow::as_select())
        .load::<LimitMintOrderRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "account": account,
        "open_positions": open_positions,
        "open_limit_orders": open_limit_orders,
    })))
}

async fn account_timeline(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows = account_timeline::table
        .filter(account_timeline::account_id.eq(account_id))
        .order(account_timeline::timestamp_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(AccountTimelineRow::as_select())
        .load::<AccountTimelineRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn vault_summary(
    State(state): State<AppState>,
    Path(vault_id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let recent = vault_snapshots::table
        .filter(vault_snapshots::vault_id.eq(&vault_id))
        .order(vault_snapshots::timestamp_ms.desc())
        .limit(64)
        .select(VaultSnapshotRow::as_select())
        .load::<VaultSnapshotRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let snapshot = merge_vault_snapshot(&recent);

    Ok(Json(json!({ "snapshot": snapshot })))
}

async fn vault_history(
    State(state): State<AppState>,
    Path(vault_id): Path<String>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut rows = vault_snapshots::table
        .filter(vault_snapshots::vault_id.eq(vault_id))
        .order(vault_snapshots::timestamp_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(VaultSnapshotRow::as_select())
        .load::<VaultSnapshotRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    for row in &mut rows {
        normalize_snapshot_row(row);
    }

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn market_trades(
    State(state): State<AppState>,
    Path(oracle_id): Path<String>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows = market_trades::table
        .filter(market_trades::oracle_id.eq(oracle_id))
        .order(market_trades::timestamp_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(MarketTradeRow::as_select())
        .load::<MarketTradeRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

#[derive(Debug, Deserialize)]
struct GlobalMarketTradeQuery {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
    trade_side: Option<String>,
    is_range: Option<bool>,
}

async fn global_market_trades(
    State(state): State<AppState>,
    Path(oracle_id): Path<String>,
    Query(q): Query<GlobalMarketTradeQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);

    let rows = fetch_combined_global_trades(
        &state.pool,
        &oracle_id,
        q.trade_side.as_deref(),
        q.is_range,
        limit,
        offset,
    )
    .await?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn events(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = leverx_events::table.into_boxed();
    if let Some(event_type) = &q.event_type {
        query = query.filter(leverx_events::event_type.eq(event_type));
    }

    let rows = query
        .order(leverx_events::timestamp_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(LeverxEventRow::as_select())
        .load::<LeverxEventRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn protocol_settings_handler(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let row = protocol_settings::table
        .order(protocol_settings::updated_at_ms.desc())
        .select(ProtocolSettingsRow::as_select())
        .first::<ProtocolSettingsRow>(&mut conn)
        .await
        .optional()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let Some(row) = row else {
        return Ok(Json(serde_json::Value::Null));
    };

    let mut value = serde_json::to_value(row).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(obj) = value.as_object_mut() {
        if let Ok(package_id) = std::env::var("LEVERX_PACKAGE_ID") {
            let package_id = package_id.trim();
            if !package_id.is_empty() {
                obj.insert("package_id".into(), json!(package_id));
            }
        }
        if let Ok(predict_package_id) = std::env::var("PREDICT_PACKAGE_ID") {
            let predict_package_id = predict_package_id.trim();
            if !predict_package_id.is_empty() {
                obj.insert("predict_package_id".into(), json!(predict_package_id));
            }
        }
    }
    Ok(Json(value))
}

async fn triggers_list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = position_triggers::table.into_boxed();
    if let Some(account_id) = &q.account_id {
        query = query.filter(position_triggers::account_id.eq(account_id));
    }
    query = query.filter(position_triggers::active.eq(true));

    let rows = query
        .order(position_triggers::updated_at_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(PositionTriggerRow::as_select())
        .load::<PositionTriggerRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn executors_list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = proxy_executors::table.into_boxed();
    if let Some(account_id) = &q.account_id {
        query = query.filter(proxy_executors::account_id.eq(account_id));
    }
    query = query.filter(proxy_executors::active.eq(true));

    let rows = query
        .order(proxy_executors::registered_at_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(ProxyExecutorRow::as_select())
        .load::<ProxyExecutorRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}

async fn liquidations_list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let (limit, offset) = parse_limit_offset(q.limit, q.offset);
    let mut conn = state.pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut query = liquidations::table.into_boxed();
    if let Some(account_id) = &q.account_id {
        query = query.filter(liquidations::account_id.eq(account_id));
    }
    if let Some(owner) = &q.owner {
        query = query.filter(liquidations::owner.eq(owner));
    }

    let rows = query
        .order(liquidations::timestamp_ms.desc())
        .limit(limit + 1)
        .offset(offset)
        .select(LiquidationRow::as_select())
        .load::<LiquidationRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(paginate(rows, limit, offset)).unwrap()))
}
