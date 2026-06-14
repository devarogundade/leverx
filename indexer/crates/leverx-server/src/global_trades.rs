//! Combined global trade feed: DeepBook Predict mint/redeem plus LeverX opens/closes.
//!
//! LeverX leveraged fills are stored in `market_trades`; standalone Predict activity lives in
//! `global_market_trades`. The UI expects a single oracle-wide tape, so we merge both and drop
//! LeverX rows when the same tx already emitted a matching Predict trade event.

use std::collections::{HashMap, HashSet};

use axum::http::StatusCode;
use diesel::prelude::*;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::RunQueryDsl;
use diesel_async::AsyncPgConnection;
use leverx_schema::models::{GlobalMarketTradeRow, MarketRow, MarketTradeRow, ProtocolSettingsRow};
use leverx_schema::schema::{
    global_market_trades, market_trades, markets, protocol_settings, user_proxies,
};

fn tx_digest(event_digest: &str) -> &str {
    event_digest.split_once(':').map(|(digest, _)| digest).unwrap_or(event_digest)
}

#[derive(Hash, Eq, PartialEq)]
struct TradeFingerprint {
    tx_digest: String,
    quantity: i64,
    trade_side: String,
}

fn fingerprint(tx: &str, quantity: i64, trade_side: &str) -> TradeFingerprint {
    TradeFingerprint {
        tx_digest: tx.to_string(),
        quantity,
        trade_side: trade_side.to_string(),
    }
}

fn trade_side_for_kind(trade_kind: &str) -> Option<&'static str> {
    match trade_kind {
        "open" => Some("mint"),
        "close" => Some("redeem"),
        _ => None,
    }
}

fn default_quote_asset() -> String {
    std::env::var("QUOTE_TYPE").unwrap_or_default()
}

async fn latest_predict_id(conn: &mut AsyncPgConnection) -> String {
    protocol_settings::table
        .order(protocol_settings::updated_at_ms.desc())
        .select(ProtocolSettingsRow::as_select())
        .first::<ProtocolSettingsRow>(conn)
        .await
        .ok()
        .and_then(|row| row.predict_id)
        .unwrap_or_default()
}

async fn reference_quote_asset(conn: &mut AsyncPgConnection, oracle_id: &str) -> String {
    global_market_trades::table
        .filter(global_market_trades::oracle_id.eq(oracle_id))
        .filter(global_market_trades::quote_asset.ne(""))
        .order(global_market_trades::timestamp_ms.desc())
        .select(global_market_trades::quote_asset)
        .first::<String>(conn)
        .await
        .unwrap_or_else(|_| default_quote_asset())
}

fn market_trade_to_global(
    trade: &MarketTradeRow,
    market: &MarketRow,
    predict_id: &str,
    manager_id: &str,
    quote_asset: &str,
) -> Option<GlobalMarketTradeRow> {
    let trade_side = trade_side_for_kind(&trade.trade_kind)?.to_string();
    let is_open = trade.trade_kind == "open";

    Some(GlobalMarketTradeRow {
        event_digest: trade.event_digest.clone(),
        event_type: if is_open {
            "LeveragedPositionOpened".into()
        } else {
            "LeveragedPositionClosed".into()
        },
        predict_id: predict_id.to_string(),
        manager_id: manager_id.to_string(),
        market_key: trade.position_key.clone(),
        oracle_id: trade.oracle_id.clone(),
        expiry_ms: market.expiry_ms,
        strike: market.strike,
        higher_strike: market.higher_strike,
        is_up: market.is_up,
        is_range: market.is_range,
        quote_asset: quote_asset.to_string(),
        trade_side,
        quantity: trade.quantity,
        cost: if is_open { trade.notional_quote } else { None },
        payout: if is_open { None } else { trade.notional_quote },
        ask_price: if is_open { trade.premium_per_unit } else { None },
        bid_price: if is_open { None } else { None },
        trader: if is_open { trade.owner.clone() } else { None },
        owner: if is_open { None } else { trade.owner.clone() },
        executor: None,
        is_settled: if is_open { None } else { Some(false) },
        timestamp_ms: trade.timestamp_ms,
    })
}

pub async fn fetch_combined_global_trades(
    pool: &Pool<AsyncPgConnection>,
    oracle_id: &str,
    trade_side: Option<&str>,
    is_range: Option<bool>,
    limit: i64,
    offset: i64,
) -> Result<Vec<GlobalMarketTradeRow>, StatusCode> {
    let mut conn = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let fetch_cap = (limit + offset + limit + 1).clamp(50, 1000);

    let mut global_query = global_market_trades::table.into_boxed();
    global_query = global_query.filter(global_market_trades::oracle_id.eq(oracle_id));
    if let Some(side) = trade_side {
        global_query = global_query.filter(global_market_trades::trade_side.eq(side));
    }
    if let Some(is_range) = is_range {
        global_query = global_query.filter(global_market_trades::is_range.eq(is_range));
    }

    let mut globals = global_query
        .order(global_market_trades::timestamp_ms.desc())
        .limit(fetch_cap)
        .select(GlobalMarketTradeRow::as_select())
        .load::<GlobalMarketTradeRow>(&mut conn)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "global_market_trades query failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut market_query = market_trades::table
        .inner_join(markets::table.on(market_trades::position_key.eq(markets::market_key)))
        .into_boxed();
    market_query = market_query.filter(market_trades::oracle_id.eq(oracle_id));
    market_query =
        market_query.filter(market_trades::trade_kind.eq_any(["open", "close"]));
    if let Some(is_range) = is_range {
        market_query = market_query.filter(markets::is_range.eq(is_range));
    }

    let market_rows: Vec<(MarketTradeRow, MarketRow)> = market_query
        .order(market_trades::timestamp_ms.desc())
        .limit(fetch_cap)
        .select((MarketTradeRow::as_select(), MarketRow::as_select()))
        .load(&mut conn)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "market_trades query failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let account_ids: Vec<String> = market_rows
        .iter()
        .filter_map(|(trade, _)| trade.account_id.clone())
        .collect();
    let manager_by_account: HashMap<String, String> = if account_ids.is_empty() {
        HashMap::new()
    } else {
        user_proxies::table
            .filter(user_proxies::account_id.eq_any(account_ids))
            .select((user_proxies::account_id, user_proxies::predict_manager_id))
            .load::<(String, Option<String>)>(&mut conn)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "user_proxies query failed");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .into_iter()
            .filter_map(|(account_id, manager_id)| manager_id.map(|id| (account_id, id)))
            .collect()
    };

    let predict_id = latest_predict_id(&mut conn).await;
    let quote_asset = reference_quote_asset(&mut conn, oracle_id).await;

    let covered: HashSet<TradeFingerprint> = globals
        .iter()
        .map(|row| fingerprint(tx_digest(&row.event_digest), row.quantity, &row.trade_side))
        .collect();

    for (trade, market) in market_rows {
        let Some(side) = trade_side_for_kind(&trade.trade_kind) else {
            continue;
        };
        if trade_side.is_some_and(|filter| filter != side) {
            continue;
        }
        let fp = fingerprint(tx_digest(&trade.event_digest), trade.quantity, side);
        if covered.contains(&fp) {
            continue;
        }

        let manager_id = trade
            .account_id
            .as_ref()
            .and_then(|account_id| manager_by_account.get(account_id))
            .cloned()
            .unwrap_or_default();
        if let Some(row) = market_trade_to_global(
            &trade,
            &market,
            &predict_id,
            &manager_id,
            &quote_asset,
        ) {
            globals.push(row);
        }
    }

    globals.sort_by(|a, b| b.timestamp_ms.cmp(&a.timestamp_ms));
    let start = offset as usize;
    let end = start.saturating_add(limit as usize + 1);
    if start >= globals.len() {
        return Ok(Vec::new());
    }
    Ok(globals[start..globals.len().min(end)].to_vec())
}
