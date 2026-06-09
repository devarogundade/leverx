//! LeverX leveraged-trade volume leaderboard (`user_points` from `market_trades` open/close).

use axum::http::StatusCode;
use diesel::prelude::*;
use diesel::sql_query;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::RunQueryDsl;
use diesel_async::AsyncPgConnection;
use serde::Serialize;

use crate::pagination::{paginate, parse_limit_offset};

#[derive(Debug, QueryableByName, Serialize, Clone)]
pub struct LeaderboardRow {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub rank: i64,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub owner: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub account_id: Option<String>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub volume_quote: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub trade_count: i64,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub points: i64,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
    pub first_trade_at_ms: Option<i64>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
    pub last_trade_at_ms: Option<i64>,
}

const LEADERBOARD_SQL: &str = r#"
SELECT
    ROW_NUMBER() OVER (ORDER BY points DESC, volume_quote DESC, owner ASC) AS rank,
    owner,
    account_id,
    volume_quote,
    trade_count,
    points,
    first_trade_at_ms,
    last_trade_at_ms
FROM user_points
WHERE points > 0
ORDER BY points DESC, volume_quote DESC, owner ASC
LIMIT $1 OFFSET $2
"#;

const LEADERBOARD_OWNER_SQL: &str = r#"
SELECT
    rank,
    owner,
    account_id,
    volume_quote,
    trade_count,
    points,
    first_trade_at_ms,
    last_trade_at_ms
FROM (
    SELECT
        ROW_NUMBER() OVER (ORDER BY points DESC, volume_quote DESC, owner ASC) AS rank,
        owner,
        account_id,
        volume_quote,
        trade_count,
        points,
        first_trade_at_ms,
        last_trade_at_ms
    FROM user_points
    WHERE points > 0
) ranked
WHERE owner = $1
"#;

pub async fn fetch_leaderboard(
    pool: &Pool<AsyncPgConnection>,
    limit: i64,
    offset: i64,
) -> Result<Vec<LeaderboardRow>, StatusCode> {
    let mut conn = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sql_query(LEADERBOARD_SQL)
        .bind::<diesel::sql_types::BigInt, _>(limit + 1)
        .bind::<diesel::sql_types::BigInt, _>(offset)
        .load::<LeaderboardRow>(&mut conn)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn fetch_owner_rank(
    pool: &Pool<AsyncPgConnection>,
    owner: &str,
) -> Result<Option<LeaderboardRow>, StatusCode> {
    let mut conn = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sql_query(LEADERBOARD_OWNER_SQL)
        .bind::<diesel::sql_types::Text, _>(owner)
        .get_result::<LeaderboardRow>(&mut conn)
        .await
        .optional()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn leaderboard_response(rows: Vec<LeaderboardRow>, limit: i64, offset: i64) -> serde_json::Value {
    serde_json::to_value(paginate(rows, limit, offset)).unwrap()
}

pub fn parse_leaderboard_pagination(limit: Option<i64>, offset: Option<i64>) -> (i64, i64) {
    parse_limit_offset(limit, offset)
}
