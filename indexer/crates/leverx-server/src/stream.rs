use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::AsyncPgConnection;
use leverx_schema::models::{
    GlobalMarketTradeRow, LeveragedPositionRow, LeverxEventRow, LimitMintOrderRow,
};
use leverx_schema::schema::{global_market_trades, leveraged_positions, leverx_events, limit_mint_orders};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{broadcast, RwLock};

use crate::orderbook;
use crate::pagination::paginate;

const STREAM_PAGE_LIMIT: i64 = 200;

#[derive(Debug, Clone)]
pub struct StreamMessage {
    pub channel: String,
    pub msg_type: String,
    pub data: Value,
    pub ts: i64,
}

#[derive(Debug, Clone)]
pub struct OrderBookChannel {
    pub oracle_id: String,
    pub expiry_ms: i64,
    pub strike: i64,
    pub higher_strike: i64,
    pub is_up: bool,
    pub is_range: bool,
}

#[derive(Debug, Clone)]
pub enum ChannelKind {
    OrderBook(OrderBookChannel),
    GlobalTrades { oracle_id: String },
    Positions { owner: String, oracle_id: Option<String> },
    LimitOrders { owner: String, oracle_id: Option<String> },
}

pub fn parse_channel(raw: &str) -> Option<ChannelKind> {
    let mut parts = raw.split(':');
    match parts.next()? {
        "orderbook" => {
            let oracle_id = parts.next()?.to_string();
            let expiry_ms: i64 = parts.next()?.parse().ok()?;
            let strike: i64 = parts.next()?.parse().ok()?;
            let higher_strike: i64 = parts.next()?.parse().ok()?;
            let is_up = parts.next()? == "1";
            let is_range = parts.next()? == "1";
            Some(ChannelKind::OrderBook(OrderBookChannel {
                oracle_id,
                expiry_ms,
                strike,
                higher_strike,
                is_up,
                is_range,
            }))
        }
        "trades" if parts.next()? == "global" => {
            Some(ChannelKind::GlobalTrades {
                oracle_id: parts.next()?.to_string(),
            })
        }
        "positions" => {
            let owner = parts.next()?.to_string();
            let oracle_id = parts.next().map(str::to_string);
            Some(ChannelKind::Positions { owner, oracle_id })
        }
        "limits" => {
            let owner = parts.next()?.to_string();
            let oracle_id = parts.next().map(str::to_string);
            Some(ChannelKind::LimitOrders { owner, oracle_id })
        }
        _ => None,
    }
}

fn json_u64(v: &Value) -> Option<u64> {
    v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

/// Reconstruct `position_key` from deserialized leverx limit-order event JSON.
fn position_key_from_parsed(parsed: &Value) -> Option<String> {
    let oracle_id = parsed.get("oracle_id").and_then(|v| v.as_str())?;
    let expiry_ms = json_u64(parsed.get("expiry_ms")?)? as i64;
    let strike = json_u64(parsed.get("strike")?)? as i64;
    let higher_strike = json_u64(parsed.get("higher_strike")?)? as i64;
    let is_up = parsed.get("is_up").and_then(|v| v.as_bool())?;
    let is_range = parsed.get("is_range").and_then(|v| v.as_bool())?;
    Some(format!(
        "{oracle_id}:{expiry_ms}:{strike}:{higher_strike}:{}:{}",
        if is_up { 1 } else { 0 },
        if is_range { 1 } else { 0 }
    ))
}

pub fn orderbook_channel_from_position_key(position_key: &str) -> Option<String> {
    let parts: Vec<&str> = position_key.split(':').collect();
    if parts.len() < 6 {
        return None;
    }
    Some(format!(
        "orderbook:{}:{}:{}:{}:{}:{}",
        parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
    ))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Clone)]
pub struct StreamHub {
    tx: broadcast::Sender<Arc<StreamMessage>>,
    active: Arc<RwLock<HashSet<String>>>,
}

impl StreamHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(512);
        Self {
            tx,
            active: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Arc<StreamMessage>> {
        self.tx.subscribe()
    }

    pub async fn track_channels(&self, channels: &[String]) {
        let mut active = self.active.write().await;
        for ch in channels {
            active.insert(ch.clone());
        }
    }

    pub async fn untrack_channels(&self, channels: &[String]) {
        let mut active = self.active.write().await;
        for ch in channels {
            active.remove(ch);
        }
    }

    pub async fn active_channels(&self) -> HashSet<String> {
        self.active.read().await.clone()
    }

    pub fn publish(&self, message: StreamMessage) {
        let _ = self.tx.send(Arc::new(message));
    }

    pub async fn snapshot_for_channel(
        pool: &Pool<AsyncPgConnection>,
        channel: &str,
    ) -> Result<Option<StreamMessage>> {
        let Some(kind) = parse_channel(channel) else {
            return Ok(None);
        };
        let ts = now_ms();
        let data = match kind {
            ChannelKind::OrderBook(params) => {
                let book = orderbook::build_orderbook(
                    pool,
                    &params.oracle_id,
                    params.expiry_ms,
                    params.strike,
                    params.higher_strike,
                    params.is_up,
                    params.is_range,
                )
                .await?;
                json!(book)
            }
            ChannelKind::GlobalTrades { oracle_id } => {
                let mut conn = pool.get().await?;
                let rows = global_market_trades::table
                    .filter(global_market_trades::oracle_id.eq(oracle_id))
                    .order(global_market_trades::timestamp_ms.desc())
                    .limit(STREAM_PAGE_LIMIT + 1)
                    .offset(0)
                    .select(GlobalMarketTradeRow::as_select())
                    .load::<GlobalMarketTradeRow>(&mut conn)
                    .await?;
                json!(paginate(rows, STREAM_PAGE_LIMIT, 0))
            }
            ChannelKind::Positions { owner, oracle_id } => {
                let mut conn = pool.get().await?;
                let mut query = leveraged_positions::table.into_boxed();
                query = query.filter(leveraged_positions::owner.eq(owner));
                if let Some(oid) = oracle_id {
                    query = query.filter(leveraged_positions::oracle_id.eq(oid));
                }
                query = query.filter(leveraged_positions::status.eq("open"));
                let rows = query
                    .order(leveraged_positions::opened_at_ms.desc())
                    .limit(STREAM_PAGE_LIMIT + 1)
                    .offset(0)
                    .select(LeveragedPositionRow::as_select())
                    .load::<LeveragedPositionRow>(&mut conn)
                    .await?;
                json!(paginate(rows, STREAM_PAGE_LIMIT, 0))
            }
            ChannelKind::LimitOrders { owner, oracle_id } => {
                let mut conn = pool.get().await?;
                let mut query = limit_mint_orders::table.into_boxed();
                query = query.filter(limit_mint_orders::owner.eq(owner));
                query = query.filter(limit_mint_orders::status.eq("open"));
                if let Some(oid) = oracle_id {
                    query = query.filter(limit_mint_orders::oracle_id.eq(oid));
                }
                let rows = query
                    .order(limit_mint_orders::placed_at_ms.desc())
                    .limit(STREAM_PAGE_LIMIT + 1)
                    .offset(0)
                    .select(LimitMintOrderRow::as_select())
                    .load::<LimitMintOrderRow>(&mut conn)
                    .await?;
                json!(paginate(rows, STREAM_PAGE_LIMIT, 0))
            }
        };

        let msg_type = match parse_channel(channel) {
            Some(ChannelKind::OrderBook(_)) => "orderbook.snapshot",
            Some(ChannelKind::GlobalTrades { .. }) => "trades.global.snapshot",
            Some(ChannelKind::Positions { .. }) => "positions.snapshot",
            Some(ChannelKind::LimitOrders { .. }) => "limits.snapshot",
            None => "snapshot",
        };

        Ok(Some(StreamMessage {
            channel: channel.to_string(),
            msg_type: msg_type.to_string(),
            data,
            ts,
        }))
    }
}

#[derive(Serialize)]
struct WsEnvelope<'a> {
    #[serde(rename = "type")]
    msg_type: &'a str,
    channel: Option<&'a str>,
    ts: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    channels: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'a str>,
}

pub fn ws_json(
    msg_type: &str,
    channel: Option<&str>,
    data: Option<Value>,
    channels: Option<Vec<String>>,
    error: Option<&str>,
) -> String {
    serde_json::to_string(&WsEnvelope {
        msg_type,
        channel,
        ts: now_ms(),
        data,
        channels,
        error,
    })
    .unwrap_or_else(|_| "{}".to_string())
}

pub fn stream_message_json(msg: &StreamMessage) -> String {
    ws_json(&msg.msg_type, Some(&msg.channel), Some(msg.data.clone()), None, None)
}

pub async fn spawn_poller(pool: Pool<AsyncPgConnection>, hub: StreamHub) {
    tokio::spawn(async move {
        let mut cursor = now_ms().saturating_sub(60_000);
        let mut heartbeat = tokio::time::interval(Duration::from_secs(30));
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    hub.publish(StreamMessage {
                        channel: "_system".to_string(),
                        msg_type: "heartbeat".to_string(),
                        data: json!({}),
                        ts: now_ms(),
                    });
                }
                _ = tokio::time::sleep(Duration::from_millis(900)) => {
                    if let Err(err) = poll_once(&pool, &hub, &mut cursor).await {
                        tracing::warn!("stream poller error: {err:#}");
                    }
                }
            }
        }
    });
}

async fn poll_once(
    pool: &Pool<AsyncPgConnection>,
    hub: &StreamHub,
    cursor: &mut i64,
) -> Result<()> {
    let mut conn = pool.get().await?;
    let rows = leverx_events::table
        .filter(leverx_events::timestamp_ms.gt(*cursor))
        .order(leverx_events::timestamp_ms.asc())
        .limit(200)
        .select(LeverxEventRow::as_select())
        .load::<LeverxEventRow>(&mut conn)
        .await?;

    if rows.is_empty() {
        return Ok(());
    }

    let active = hub.active_channels().await;

    for row in rows {
        *cursor = (*cursor).max(row.timestamp_ms);
        dispatch_event(pool, hub, &active, &row).await?;
    }

    Ok(())
}

async fn dispatch_event(
    pool: &Pool<AsyncPgConnection>,
    hub: &StreamHub,
    active: &HashSet<String>,
    row: &LeverxEventRow,
) -> Result<()> {
    let parsed = &row.parsed_json;

    match row.event_type.as_str() {
        "LimitMintOrderPlaced" | "LimitMintOrderExecuted" | "LimitMintOrderCancelled" => {
            if let Some(position_key) = position_key_from_parsed(parsed) {
                if let Some(channel) = orderbook_channel_from_position_key(&position_key) {
                    if active.contains(&channel) {
                        push_snapshot(pool, hub, &channel).await?;
                    }
                }
            }
            if let Some(owner) = parsed.get("owner").and_then(|v| v.as_str()) {
                let oracle_id = parsed.get("oracle_id").and_then(|v| v.as_str());
                push_matching_limits(pool, hub, active, owner, oracle_id).await?;
            }
        }
        "PositionMinted"
        | "PositionRedeemed"
        | "RangeMinted"
        | "RangeRedeemed" => {
            if let Some(oracle_id) = parsed.get("oracle_id").and_then(|v| v.as_str()) {
                let channel = format!("trades:global:{oracle_id}");
                if active.contains(&channel) {
                    push_snapshot(pool, hub, &channel).await?;
                }
                for ch in active.iter() {
                    if ch.starts_with("orderbook:") && ch.contains(oracle_id) {
                        push_snapshot(pool, hub, ch).await?;
                    }
                }
            }
        }
        "LeveragedPositionOpened"
        | "LeveragedPositionClosed"
        | "PositionLiquidated"
        | "PositionForceDeleveraged"
        | "BadDebtWrittenOff"
        | "KeyBorrowUpdated" => {
            if let Some(owner) = parsed.get("owner").and_then(|v| v.as_str()) {
                push_matching_positions(pool, hub, active, owner, None).await?;
            }
        }
        _ => {}
    }

    Ok(())
}

async fn push_matching_positions(
    pool: &Pool<AsyncPgConnection>,
    hub: &StreamHub,
    active: &HashSet<String>,
    owner: &str,
    oracle_id: Option<&str>,
) -> Result<()> {
    for ch in active.iter() {
        if let Some(ChannelKind::Positions {
            owner: sub_owner,
            oracle_id: sub_oracle,
        }) = parse_channel(ch)
        {
            if sub_owner != owner {
                continue;
            }
            if let Some(oid) = oracle_id {
                if sub_oracle.as_deref() != Some(oid) && sub_oracle.is_some() {
                    continue;
                }
            }
            push_snapshot(pool, hub, ch).await?;
        }
    }
    Ok(())
}

async fn push_matching_limits(
    pool: &Pool<AsyncPgConnection>,
    hub: &StreamHub,
    active: &HashSet<String>,
    owner: &str,
    oracle_id: Option<&str>,
) -> Result<()> {
    for ch in active.iter() {
        if let Some(ChannelKind::LimitOrders {
            owner: sub_owner,
            oracle_id: sub_oracle,
        }) = parse_channel(ch)
        {
            if sub_owner != owner {
                continue;
            }
            if let Some(oid) = oracle_id {
                if sub_oracle.as_deref() != Some(oid) && sub_oracle.is_some() {
                    continue;
                }
            }
            push_snapshot(pool, hub, ch).await?;
        }
    }
    Ok(())
}

async fn push_snapshot(pool: &Pool<AsyncPgConnection>, hub: &StreamHub, channel: &str) -> Result<()> {
    if let Some(msg) = StreamHub::snapshot_for_channel(pool, channel).await? {
        hub.publish(msg);
    }
    Ok(())
}
