//! Vault snapshot gauge corrections.
//!
//! Some on-chain events sample state **before** the transition while the indexer/API
//! need **after** values for TVL and charts.

use serde_json::Value as JsonValue;

use crate::models::VaultSnapshotRow;

const VAULT_FEE_SHARE_BPS: i64 = 8_000;
const BPS: i64 = 10_000;

fn json_u64(v: &JsonValue) -> Option<i64> {
    v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .map(|n| n as i64)
}

fn raw_nav_from_payload(payload: &JsonValue) -> Option<i64> {
    payload.get("nav").and_then(json_u64)
}

fn fee_from_payload(payload: &JsonValue) -> Option<i64> {
    payload.get("fee").and_then(json_u64)
}

/// Correct NAV for events that emit a pre-transition pool size.
pub fn corrected_nav(
    event_type: &str,
    stored_nav: Option<i64>,
    amount: Option<i64>,
    payload: &JsonValue,
) -> Option<i64> {
    let stored = stored_nav?;
    match event_type {
        // `leverage_vault::withdraw` emits `nav(vault)` before burning shares / taking quote.
        "VaultWithdrawn" => {
            let amount = amount?;
            if raw_nav_from_payload(payload).is_some_and(|raw| stored == raw) {
                Some(stored.saturating_sub(amount))
            } else {
                Some(stored)
            }
        }
        _ => Some(stored),
    }
}

/// Apply balance deltas for events that omit NAV but move idle vault liquidity.
pub fn apply_nav_delta_for_event(
    event_type: &str,
    nav: Option<i64>,
    amount: Option<i64>,
    payload: &JsonValue,
) -> Option<i64> {
    let nav = nav?;
    let amount = amount?;
    match event_type {
        // `borrow_flash_liquidity` removes quote from the pool before the event fires.
        "FlashLoanBorrowed" => Some(nav.saturating_sub(amount)),
        // Principal returns to NAV; 80% of the flash fee is credited to LPs.
        "FlashLoanRepaid" => {
            let fee = fee_from_payload(payload).unwrap_or(0);
            let vault_fee = fee.saturating_mul(VAULT_FEE_SHARE_BPS) / BPS;
            Some(nav.saturating_add(amount).saturating_add(vault_fee))
        }
        _ => Some(nav),
    }
}

pub fn normalize_snapshot_row(row: &mut VaultSnapshotRow) {
    row.nav = corrected_nav(&row.event_type, row.nav, row.amount, &row.payload);
}

/// Merge latest vault snapshot with recent history and normalize TVL gauges.
pub fn merge_vault_snapshot(rows: &[VaultSnapshotRow]) -> Option<VaultSnapshotRow> {
    let latest = rows.first()?;
    let mut merged = latest.clone();
    merged.nav = corrected_nav(
        &merged.event_type,
        merged.nav,
        merged.amount,
        &merged.payload,
    );

    for row in rows.iter().skip(1) {
        if merged.nav.is_none() {
            merged.nav = corrected_nav(&row.event_type, row.nav, row.amount, &row.payload);
        }
        if merged.utilization_bps.is_none() {
            merged.utilization_bps = row.utilization_bps;
        }
        if merged.total_borrowed.is_none() {
            merged.total_borrowed = row.total_borrowed;
        }
        if merged.borrow_rate_bps.is_none() {
            merged.borrow_rate_bps = row.borrow_rate_bps;
        }
        if merged.lp_apr_bps.is_none() {
            merged.lp_apr_bps = row.lp_apr_bps;
        }
    }

    merged.nav = apply_nav_delta_for_event(
        &merged.event_type,
        merged.nav,
        merged.amount,
        &merged.payload,
    );
    Some(merged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn vault_withdrawn_corrects_pre_transition_nav() {
        let payload = json!({ "nav": 5_000_000, "amount": 1_250_000 });
        assert_eq!(
            corrected_nav("VaultWithdrawn", Some(5_000_000), Some(1_250_000), &payload),
            Some(3_750_000)
        );
    }

    #[test]
    fn vault_withdrawn_skips_already_corrected_nav() {
        let payload = json!({ "nav": 5_000_000, "amount": 1_250_000 });
        assert_eq!(
            corrected_nav("VaultWithdrawn", Some(3_750_000), Some(1_250_000), &payload),
            Some(3_750_000)
        );
    }

    #[test]
    fn flash_loan_borrow_and_repay_adjust_nav() {
        let payload = json!({ "fee": 1_000 });
        assert_eq!(
            apply_nav_delta_for_event("FlashLoanBorrowed", Some(10_000_000), Some(2_000_000), &payload),
            Some(8_000_000)
        );
        assert_eq!(
            apply_nav_delta_for_event("FlashLoanRepaid", Some(8_000_000), Some(2_000_000), &payload),
            Some(10_000_800)
        );
    }
}
