//! BCS layouts matching `deepbook_predict::predict` mint/redeem events.

use serde::{Deserialize, Serialize};
use sui_types::base_types::{ObjectID, SuiAddress};

use crate::move_events::{try_parse, TypeNameWire};

#[derive(Debug, Deserialize, Serialize)]
pub struct PositionMinted {
    pub predict_id: ObjectID,
    pub manager_id: ObjectID,
    pub trader: SuiAddress,
    pub quote_asset: TypeNameWire,
    pub oracle_id: ObjectID,
    pub expiry: u64,
    pub strike: u64,
    pub is_up: bool,
    pub quantity: u64,
    pub cost: u64,
    pub ask_price: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PositionRedeemed {
    pub predict_id: ObjectID,
    pub manager_id: ObjectID,
    pub owner: SuiAddress,
    pub executor: SuiAddress,
    pub quote_asset: TypeNameWire,
    pub oracle_id: ObjectID,
    pub expiry: u64,
    pub strike: u64,
    pub is_up: bool,
    pub quantity: u64,
    pub payout: u64,
    pub bid_price: u64,
    pub is_settled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RangeMinted {
    pub predict_id: ObjectID,
    pub manager_id: ObjectID,
    pub trader: SuiAddress,
    pub quote_asset: TypeNameWire,
    pub oracle_id: ObjectID,
    pub expiry: u64,
    pub lower_strike: u64,
    pub higher_strike: u64,
    pub quantity: u64,
    pub cost: u64,
    pub ask_price: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RangeRedeemed {
    pub predict_id: ObjectID,
    pub manager_id: ObjectID,
    pub trader: SuiAddress,
    pub quote_asset: TypeNameWire,
    pub oracle_id: ObjectID,
    pub expiry: u64,
    pub lower_strike: u64,
    pub higher_strike: u64,
    pub quantity: u64,
    pub payout: u64,
    pub bid_price: u64,
    pub is_settled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PredictManagerCreated {
    pub manager_id: ObjectID,
    pub owner: SuiAddress,
}

pub const PREDICT_TRADE_EVENTS: &[&str] = &[
    "PositionMinted",
    "PositionRedeemed",
    "RangeMinted",
    "RangeRedeemed",
];

pub const PREDICT_MANAGER_EVENTS: &[&str] = &["PredictManagerCreated"];

pub fn is_predict_trade_event(event_name: &str) -> bool {
    PREDICT_TRADE_EVENTS.contains(&event_name)
}

pub fn is_predict_manager_event(event_name: &str) -> bool {
    PREDICT_MANAGER_EVENTS.contains(&event_name)
}

pub fn parse_predict_event_json(event_name: &str, bytes: &[u8]) -> serde_json::Value {
    use serde_json::json;

    macro_rules! parse_as {
        ($ty:ty) => {
            if let Some(v) = try_parse::<$ty>(bytes) {
                return serde_json::to_value(v).unwrap_or(json!({}));
            }
        };
    }

    match event_name {
        "PredictManagerCreated" => parse_as!(PredictManagerCreated),
        "PositionMinted" => parse_as!(PositionMinted),
        "PositionRedeemed" => parse_as!(PositionRedeemed),
        "RangeMinted" => parse_as!(RangeMinted),
        "RangeRedeemed" => parse_as!(RangeRedeemed),
        _ => {}
    }

    json!({ "raw_bcs_len": bytes.len() })
}
