use axum::http::StatusCode;
use diesel::prelude::*;
use diesel::sql_query;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::RunQueryDsl;
use diesel_async::AsyncPgConnection;
use serde::Serialize;

use crate::pagination::{paginate, parse_limit_offset};

#[derive(Debug, QueryableByName, Serialize, Clone)]
pub struct MarketCatalogRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub market_key: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub oracle_id: String,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub expiry_ms: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub strike: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub higher_strike: i64,
    #[diesel(sql_type = diesel::sql_types::Bool)]
    pub is_up: bool,
    #[diesel(sql_type = diesel::sql_types::Bool)]
    pub is_range: bool,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
    pub last_ask_price: Option<i64>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
    pub last_bid_price: Option<i64>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub volume_24h: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub trade_count_24h: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub updated_at_ms: i64,
}

const CATALOG_SQL: &str = r#"
SELECT
    m.market_key,
    m.oracle_id,
    m.expiry_ms,
    m.strike,
    m.higher_strike,
    m.is_up,
    m.is_range,
    lt.last_ask_price,
    lb.last_bid_price,
    COALESCE(v.volume_24h, 0) AS volume_24h,
    COALESCE(v.trade_count_24h, 0) AS trade_count_24h,
    m.updated_at_ms
FROM markets m
LEFT JOIN LATERAL (
    SELECT ask_price AS last_ask_price
    FROM global_market_trades g
    WHERE g.market_key = m.market_key AND g.trade_side = 'mint'
    ORDER BY g.timestamp_ms DESC
    LIMIT 1
) lt ON TRUE
LEFT JOIN LATERAL (
    SELECT bid_price AS last_bid_price
    FROM global_market_trades g
    WHERE g.market_key = m.market_key AND g.trade_side = 'redeem'
    ORDER BY g.timestamp_ms DESC
    LIMIT 1
) lb ON TRUE
LEFT JOIN (
    SELECT
        market_key,
        SUM(volume) AS volume_24h,
        SUM(trade_count) AS trade_count_24h
    FROM (
        SELECT
            market_key,
            SUM(COALESCE(cost, payout, 0)) AS volume,
            COUNT(*) AS trade_count
        FROM global_market_trades
        WHERE timestamp_ms > (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)
        GROUP BY market_key
        UNION ALL
        SELECT
            position_key AS market_key,
            SUM(COALESCE(notional_quote, 0)) AS volume,
            COUNT(*) AS trade_count
        FROM market_trades
        WHERE timestamp_ms > (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)
          AND trade_kind IN ('open', 'close')
        GROUP BY position_key
    ) combined
    GROUP BY market_key
) v ON v.market_key = m.market_key
WHERE ($1::text IS NULL OR m.oracle_id = $1)
  AND ($2::bool IS NULL OR m.is_range = $2)
ORDER BY volume_24h DESC, m.updated_at_ms DESC
LIMIT $3 OFFSET $4
"#;

pub async fn fetch_market_catalog(
    pool: &Pool<AsyncPgConnection>,
    oracle_id: Option<&str>,
    is_range: Option<bool>,
    limit: i64,
    offset: i64,
) -> Result<Vec<MarketCatalogRow>, StatusCode> {
    let mut conn = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sql_query(CATALOG_SQL)
        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(oracle_id)
        .bind::<diesel::sql_types::Nullable<diesel::sql_types::Bool>, _>(is_range)
        .bind::<diesel::sql_types::BigInt, _>(limit + 1)
        .bind::<diesel::sql_types::BigInt, _>(offset)
        .load::<MarketCatalogRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn catalog_response(
    rows: Vec<MarketCatalogRow>,
    limit: i64,
    offset: i64,
) -> serde_json::Value {
    serde_json::to_value(paginate(rows, limit, offset)).unwrap()
}

pub fn parse_catalog_pagination(limit: Option<i64>, offset: Option<i64>) -> (i64, i64) {
    parse_limit_offset(limit, offset)
}
