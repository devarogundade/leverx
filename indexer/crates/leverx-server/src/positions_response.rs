use serde::Serialize;
use serde_json::{json, Value};

use leverx_schema::models::LeveragedPositionRow;
use leverx_schema::position_hints::compute_position_action_hints;

use crate::pagination::Page;

#[derive(Debug, Serialize)]
pub struct LeveragedPositionWithHints {
    #[serde(flatten)]
    pub position: LeveragedPositionRow,
    pub action_hints: leverx_schema::PositionActionHints,
}

pub fn position_with_hints(row: LeveragedPositionRow, now_ms: i64) -> LeveragedPositionWithHints {
    let action_hints = compute_position_action_hints(&row, now_ms);
    LeveragedPositionWithHints {
        position: row,
        action_hints,
    }
}

pub fn positions_page_with_hints(
    rows: Vec<LeveragedPositionRow>,
    limit: i64,
    offset: i64,
    now_ms: i64,
) -> Page<LeveragedPositionWithHints> {
    let has_more = rows.len() > limit as usize;
    let items = rows
        .into_iter()
        .take(limit as usize)
        .map(|row| position_with_hints(row, now_ms))
        .collect();
    Page {
        items,
        limit,
        offset,
        has_more,
    }
}

pub fn positions_json_page(
    rows: Vec<LeveragedPositionRow>,
    limit: i64,
    offset: i64,
    now_ms: i64,
) -> Value {
    json!(positions_page_with_hints(rows, limit, offset, now_ms))
}

pub fn positions_json_list(rows: Vec<LeveragedPositionRow>, now_ms: i64) -> Vec<Value> {
    rows.into_iter()
        .map(|row| {
            let wrapped = position_with_hints(row, now_ms);
            serde_json::to_value(wrapped).unwrap_or(Value::Null)
        })
        .collect()
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
