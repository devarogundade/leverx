-- Backfill close_debt_repaid on liquidated rows from indexed liquidation events.
-- Before this repair, PositionLiquidated only set status/borrow_quote/closed_at_ms,
-- which made the app treat peak vault borrow as wallet repayments.

UPDATE leveraged_positions lp
SET
    close_debt_repaid = l.debt_repaid,
    close_interest_paid = GREATEST(
        l.debt_repaid - GREATEST(lp.peak_borrow_quote, lp.borrow_quote, 0),
        0
    )
FROM liquidations l
WHERE lp.position_key = l.position_key
  AND lp.account_id = l.account_id
  AND lp.status = 'liquidated'
  AND lp.close_debt_repaid = 0
  AND l.debt_repaid > 0
  AND l.event_kind IN ('liquidation', 'bad_debt');
