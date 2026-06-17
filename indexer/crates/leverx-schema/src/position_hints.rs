use serde::Serialize;

use crate::models::LeveragedPositionRow;

/// Indexer-derived hints for portfolio CTAs (oracle settlement still confirmed client-side).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PositionActionHints {
    pub close_source: Option<String>,
    pub leverx_custody_complete: bool,
    pub needs_custody_recovery: bool,
    pub external_redeem_payout_quote: i64,
    pub custody_recovered_quote: i64,
    /// Suggested actions before on-chain reads (`close_redeem`, `settle`, `repay_debt`, `recover_custody`, `withdraw_trading`).
    pub recommended_actions: Vec<String>,
    pub primary_cta: Option<String>,
    pub empty_state_hint: Option<String>,
}

pub fn compute_position_action_hints(
    pos: &LeveragedPositionRow,
    now_ms: i64,
) -> PositionActionHints {
    let expired = pos.expiry_ms > 0 && pos.expiry_ms < now_ms;
    let has_debt = pos.borrow_quote > 0;
    let indexer_open = pos.open_quantity > 0;
    let is_open = pos.status == "open";

    let external_payout_unrecovered = pos.external_redeem_payout_quote > 0
        && pos.custody_recovered_quote < pos.external_redeem_payout_quote;

    let needs_custody_recovery = !pos.leverx_custody_complete
        && matches!(
            pos.close_source.as_deref(),
            Some("predict_external") | Some("manager_surplus_recovery")
        );

    let indexer_stale_suspect = is_open
        && indexer_open
        && pos.close_source.as_deref() == Some("predict_external");

    let mut recommended_actions: Vec<String> = Vec::new();

    if is_open && indexer_open {
        if expired {
            recommended_actions.push("settle".into());
        } else {
            recommended_actions.push("close_redeem".into());
        }
    }

    if has_debt {
        recommended_actions.push("repay_debt".into());
    }

    if needs_custody_recovery || external_payout_unrecovered {
        recommended_actions.push("recover_custody".into());
    }

    if pos.leverx_custody_complete && pos.close_surplus_quote > 0 && !has_debt {
        recommended_actions.push("withdraw_trading".into());
    }

    let primary_cta = recommended_actions.first().cloned();

    let empty_state_hint = if needs_custody_recovery
        || (recommended_actions.contains(&"recover_custody".to_string()) && !is_open)
    {
        Some("stranded_custody".into())
    } else if indexer_stale_suspect {
        Some("index_stale".into())
    } else if is_open && indexer_open && expired {
        Some("awaiting_oracle_settlement".into())
    } else {
        None
    };

    PositionActionHints {
        close_source: pos.close_source.clone(),
        leverx_custody_complete: pos.leverx_custody_complete,
        needs_custody_recovery,
        external_redeem_payout_quote: pos.external_redeem_payout_quote,
        custody_recovered_quote: pos.custody_recovered_quote,
        recommended_actions,
        primary_cta,
        empty_state_hint,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row() -> LeveragedPositionRow {
        LeveragedPositionRow {
            position_key: "pk".into(),
            account_id: "acc".into(),
            owner: "owner".into(),
            predict_manager_id: Some("mgr".into()),
            oracle_id: "oracle".into(),
            expiry_ms: 1,
            strike: 2,
            higher_strike: 0,
            is_up: false,
            is_range: false,
            open_quantity: 0,
            margin_quote: 0,
            borrow_quote: 1_000_000,
            peak_borrow_quote: 1_000_000,
            leverage_bps: 10_000,
            mint_cost: 0,
            last_order_type: None,
            status: "closed".into(),
            opened_at_ms: Some(0),
            closed_at_ms: Some(100),
            realized_payout: 500_000,
            entry_mark: None,
            closing_mark: None,
            close_debt_repaid: 0,
            close_interest_paid: 0,
            close_surplus_quote: 0,
            close_source: Some("predict_external".into()),
            leverx_custody_complete: false,
            external_redeem_payout_quote: 500_000,
            custody_recovered_quote: 0,
        }
    }

    #[test]
    fn external_predict_close_suggests_recover_and_repay() {
        let hints = compute_position_action_hints(&sample_row(), 200);
        assert!(hints.needs_custody_recovery);
        assert!(hints.recommended_actions.contains(&"repay_debt".into()));
        assert!(hints.recommended_actions.contains(&"recover_custody".into()));
        assert_eq!(hints.empty_state_hint.as_deref(), Some("stranded_custody"));
    }

    #[test]
    fn leverx_settle_complete_suggests_withdraw_when_surplus() {
        let mut row = sample_row();
        row.status = "settled".into();
        row.borrow_quote = 0;
        row.close_source = Some("leverx_settle".into());
        row.leverx_custody_complete = true;
        row.close_surplus_quote = 100_000;
        let hints = compute_position_action_hints(&row, 200);
        assert!(!hints.needs_custody_recovery);
        assert!(hints.recommended_actions.contains(&"withdraw_trading".into()));
    }
}
