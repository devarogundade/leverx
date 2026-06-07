//! Maps `deepbook_predict` events into `global_market_trades` and `predict_managers`.

use leverx_schema::models::{NewGlobalMarketTrade, NewLeverxEvent};
use serde_json::Value as JsonValue;
use sui_types::event::Event;

use crate::handlers::LeverxBatch;
use crate::move_events::try_parse;
use crate::predict_events::{
    parse_predict_event_json, PositionMinted, PositionRedeemed, PredictManagerCreated,
    RangeMinted, RangeRedeemed,
};
use crate::relation_upserts::{ensure_market, ensure_predict_manager};

pub struct PredictEventContext<'a> {
    pub event_name: &'a str,
    pub event_digest: &'a str,
    pub tx_digest: &'a str,
    pub checkpoint: i64,
    pub timestamp_ms: i64,
    pub event: &'a Event,
    pub parsed_json: JsonValue,
}

pub fn build_predict_event_context<'a>(
    event_name: &'a str,
    event_digest: &'a str,
    tx_digest: &'a str,
    checkpoint: i64,
    timestamp_ms: i64,
    event: &'a Event,
) -> PredictEventContext<'a> {
    let parsed_json = parse_predict_event_json(event_name, event.contents.as_slice());
    PredictEventContext {
        event_name,
        event_digest,
        tx_digest,
        checkpoint,
        timestamp_ms,
        event,
        parsed_json,
    }
}

pub fn apply_predict_event(batch: &mut LeverxBatch, ctx: PredictEventContext<'_>) {
    batch.events.push(NewLeverxEvent {
        event_digest: ctx.event_digest.to_string(),
        event_type: ctx.event_name.to_string(),
        module: ctx.event.transaction_module.to_string(),
        package_id: ctx.event.package_id.to_string(),
        transaction_digest: ctx.tx_digest.to_string(),
        checkpoint: ctx.checkpoint,
        timestamp_ms: ctx.timestamp_ms,
        parsed_json: ctx.parsed_json.clone(),
    });

    match ctx.event_name {
        "PredictManagerCreated" => {
            if let Some(ev) = try_parse::<PredictManagerCreated>(ctx.event.contents.as_slice()) {
                ensure_predict_manager(
                    batch,
                    &ev.manager_id.to_string(),
                    Some(&ev.owner.to_string()),
                    None,
                    ctx.timestamp_ms,
                );
            }
        }
        "PositionMinted" => {
            if let Some(ev) = try_parse::<PositionMinted>(ctx.event.contents.as_slice()) {
                let market_key = ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry as i64,
                    ev.strike as i64,
                    0,
                    ev.is_up,
                    false,
                    ctx.timestamp_ms,
                );
                ensure_predict_manager(
                    batch,
                    &ev.manager_id.to_string(),
                    Some(&ev.trader.to_string()),
                    None,
                    ctx.timestamp_ms,
                );
                batch.global_trades.push(NewGlobalMarketTrade {
                    event_digest: ctx.event_digest.to_string(),
                    event_type: ctx.event_name.to_string(),
                    predict_id: ev.predict_id.to_string(),
                    manager_id: ev.manager_id.to_string(),
                    market_key,
                    oracle_id: ev.oracle_id.to_string(),
                    expiry_ms: ev.expiry as i64,
                    strike: ev.strike as i64,
                    higher_strike: 0,
                    is_up: ev.is_up,
                    is_range: false,
                    quote_asset: ev.quote_asset.name.clone(),
                    trade_side: "mint".into(),
                    quantity: ev.quantity as i64,
                    cost: Some(ev.cost as i64),
                    payout: None,
                    ask_price: Some(ev.ask_price as i64),
                    bid_price: None,
                    trader: Some(ev.trader.to_string()),
                    owner: None,
                    executor: None,
                    is_settled: None,
                    timestamp_ms: ctx.timestamp_ms,
                });
            }
        }
        "PositionRedeemed" => {
            if let Some(ev) = try_parse::<PositionRedeemed>(ctx.event.contents.as_slice()) {
                let market_key = ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry as i64,
                    ev.strike as i64,
                    0,
                    ev.is_up,
                    false,
                    ctx.timestamp_ms,
                );
                ensure_predict_manager(
                    batch,
                    &ev.manager_id.to_string(),
                    Some(&ev.owner.to_string()),
                    None,
                    ctx.timestamp_ms,
                );
                batch.global_trades.push(NewGlobalMarketTrade {
                    event_digest: ctx.event_digest.to_string(),
                    event_type: ctx.event_name.to_string(),
                    predict_id: ev.predict_id.to_string(),
                    manager_id: ev.manager_id.to_string(),
                    market_key,
                    oracle_id: ev.oracle_id.to_string(),
                    expiry_ms: ev.expiry as i64,
                    strike: ev.strike as i64,
                    higher_strike: 0,
                    is_up: ev.is_up,
                    is_range: false,
                    quote_asset: ev.quote_asset.name.clone(),
                    trade_side: "redeem".into(),
                    quantity: ev.quantity as i64,
                    cost: None,
                    payout: Some(ev.payout as i64),
                    ask_price: None,
                    bid_price: Some(ev.bid_price as i64),
                    trader: None,
                    owner: Some(ev.owner.to_string()),
                    executor: Some(ev.executor.to_string()),
                    is_settled: Some(ev.is_settled),
                    timestamp_ms: ctx.timestamp_ms,
                });
            }
        }
        "RangeMinted" => {
            if let Some(ev) = try_parse::<RangeMinted>(ctx.event.contents.as_slice()) {
                let market_key = ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry as i64,
                    ev.lower_strike as i64,
                    ev.higher_strike as i64,
                    false,
                    true,
                    ctx.timestamp_ms,
                );
                ensure_predict_manager(
                    batch,
                    &ev.manager_id.to_string(),
                    Some(&ev.trader.to_string()),
                    None,
                    ctx.timestamp_ms,
                );
                batch.global_trades.push(NewGlobalMarketTrade {
                    event_digest: ctx.event_digest.to_string(),
                    event_type: ctx.event_name.to_string(),
                    predict_id: ev.predict_id.to_string(),
                    manager_id: ev.manager_id.to_string(),
                    market_key,
                    oracle_id: ev.oracle_id.to_string(),
                    expiry_ms: ev.expiry as i64,
                    strike: ev.lower_strike as i64,
                    higher_strike: ev.higher_strike as i64,
                    is_up: false,
                    is_range: true,
                    quote_asset: ev.quote_asset.name.clone(),
                    trade_side: "mint".into(),
                    quantity: ev.quantity as i64,
                    cost: Some(ev.cost as i64),
                    payout: None,
                    ask_price: Some(ev.ask_price as i64),
                    bid_price: None,
                    trader: Some(ev.trader.to_string()),
                    owner: None,
                    executor: None,
                    is_settled: None,
                    timestamp_ms: ctx.timestamp_ms,
                });
            }
        }
        "RangeRedeemed" => {
            if let Some(ev) = try_parse::<RangeRedeemed>(ctx.event.contents.as_slice()) {
                let market_key = ensure_market(
                    batch,
                    &ev.oracle_id.to_string(),
                    ev.expiry as i64,
                    ev.lower_strike as i64,
                    ev.higher_strike as i64,
                    false,
                    true,
                    ctx.timestamp_ms,
                );
                ensure_predict_manager(
                    batch,
                    &ev.manager_id.to_string(),
                    Some(&ev.trader.to_string()),
                    None,
                    ctx.timestamp_ms,
                );
                batch.global_trades.push(NewGlobalMarketTrade {
                    event_digest: ctx.event_digest.to_string(),
                    event_type: ctx.event_name.to_string(),
                    predict_id: ev.predict_id.to_string(),
                    manager_id: ev.manager_id.to_string(),
                    market_key,
                    oracle_id: ev.oracle_id.to_string(),
                    expiry_ms: ev.expiry as i64,
                    strike: ev.lower_strike as i64,
                    higher_strike: ev.higher_strike as i64,
                    is_up: false,
                    is_range: true,
                    quote_asset: ev.quote_asset.name.clone(),
                    trade_side: "redeem".into(),
                    quantity: ev.quantity as i64,
                    cost: None,
                    payout: Some(ev.payout as i64),
                    ask_price: None,
                    bid_price: Some(ev.bid_price as i64),
                    trader: Some(ev.trader.to_string()),
                    owner: None,
                    executor: None,
                    is_settled: Some(ev.is_settled),
                    timestamp_ms: ctx.timestamp_ms,
                });
            }
        }
        _ => {}
    }
}
