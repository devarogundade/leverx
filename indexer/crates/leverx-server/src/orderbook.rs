use std::collections::BTreeMap;

use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::AsyncPgConnection;
use serde::Serialize;

#[derive(Serialize)]
pub struct OrderBookLevel {
    pub price: i64,
    pub size: i64,
    pub total: i64,
}

#[derive(Serialize)]
pub struct OrderBookResponse {
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
    pub last_traded_premium: Option<i64>,
    pub spread_bps: Option<i64>,
    pub bids: Vec<OrderBookLevel>,
    pub asks: Vec<OrderBookLevel>,
    pub ask_share_pct: i64,
    pub bid_share_pct: i64,
    pub updated_at_ms: i64,
}

pub async fn build_orderbook(
    pool: &Pool<AsyncPgConnection>,
    oracle_id: &str,
    expiry_ms: i64,
    strike: i64,
    higher_strike: i64,
    is_up: bool,
    is_range: bool,
) -> anyhow::Result<OrderBookResponse> {
    let mut conn = pool.get().await?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let limit_pk = format!(
        "{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{}:{}",
        if is_up { 1 } else { 0 },
        if is_range { 1 } else { 0 }
    );
    let pos_pk = format!(
        "{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{}:{}",
        if is_up { 1 } else { 0 },
        if is_range { 1 } else { 0 }
    );

    #[derive(QueryableByName)]
    struct OpenRow {
        #[diesel(sql_type = diesel::sql_types::BigInt)]
        limit_premium_per_unit: i64,
        #[diesel(sql_type = diesel::sql_types::BigInt)]
        quantity: i64,
    }

    let open_rows: Vec<OpenRow> = diesel::sql_query(
        "SELECT limit_premium_per_unit, quantity FROM limit_mint_orders \
         WHERE position_key = $1 AND status = 'open' AND order_expires_ms > $2 \
         ORDER BY limit_premium_per_unit DESC",
    )
    .bind::<diesel::sql_types::Text, _>(&limit_pk)
    .bind::<diesel::sql_types::BigInt, _>(now_ms)
    .load(&mut conn)
    .await?;

    let mut by_price: BTreeMap<i64, i64> = BTreeMap::new();
    for row in open_rows {
        *by_price.entry(row.limit_premium_per_unit).or_insert(0) += row.quantity;
    }
    let mut total = 0i64;
    let bids: Vec<OrderBookLevel> = by_price
        .into_iter()
        .rev()
        .map(|(price, size)| {
            total += size;
            OrderBookLevel { price, size, total }
        })
        .collect();

    #[derive(QueryableByName)]
    struct TradeRow {
        #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
        premium_per_unit: Option<i64>,
    }

    let last_trade: Option<TradeRow> = diesel::sql_query(
        "SELECT premium_per_unit FROM market_trades \
         WHERE position_key = $1 AND premium_per_unit IS NOT NULL \
         ORDER BY timestamp_ms DESC LIMIT 1",
    )
    .bind::<diesel::sql_types::Text, _>(&pos_pk)
    .get_result(&mut conn)
    .await
    .optional()?;

    let last_traded = last_trade.and_then(|t| t.premium_per_unit);
    let best_bid = bids.get(0).map(|b| b.price);
    let mid = last_traded.or(best_bid).unwrap_or(0);
    let asks = if mid > 0 { synthetic_asks(mid) } else { vec![] };

    let bid_size: i64 = bids.iter().map(|b| b.size).sum();
    let ask_size: i64 = asks.iter().map(|a| a.size).sum();
    let total_size = bid_size + ask_size;
    let bid_share = if total_size > 0 {
        (bid_size * 100) / total_size
    } else {
        50
    };

    let spread_bps = match (bids.get(0), asks.last()) {
        (Some(bid), Some(ask)) => Some((((ask.price - bid.price) * 10000) / 1_000_000_000) as i64),
        _ => None,
    };

    Ok(OrderBookResponse {
        oracle_id: oracle_id.to_string(),
        expiry_ms,
        strike,
        higher_strike,
        is_up,
        is_range,
        last_traded_premium: last_traded,
        spread_bps,
        bids,
        asks,
        ask_share_pct: 100 - bid_share,
        bid_share_pct: bid_share,
        updated_at_ms: now_ms,
    })
}

fn synthetic_asks(mid: i64) -> Vec<OrderBookLevel> {
    let mid_cents = (mid * 100) / 1_000_000_000;
    let mut asks = Vec::new();
    let mut total = 0i64;
    for i in 1..=7 {
        let size = 400 + i * 120;
        total += size;
        let price = ((mid_cents + i * 5) * 1_000_000_000) / 100;
        asks.insert(0, OrderBookLevel { price, size, total });
    }
    asks
}
