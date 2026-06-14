ALTER TABLE leveraged_positions
    ADD COLUMN IF NOT EXISTS peak_borrow_quote BIGINT NOT NULL DEFAULT 0;

-- Seed from open events (initial borrow at mint).
UPDATE leveraged_positions lp
SET peak_borrow_quote = GREATEST(lp.peak_borrow_quote, opens.peak)
FROM (
    SELECT
        mt.position_key,
        mt.account_id,
        MAX((le.parsed_json ->> 'borrow_quote')::bigint) AS peak
    FROM market_trades mt
    JOIN leverx_events le ON le.event_digest = mt.event_digest
    WHERE le.event_type = 'LeveragedPositionOpened'
      AND mt.account_id IS NOT NULL
    GROUP BY mt.position_key, mt.account_id
) opens
WHERE lp.position_key = opens.position_key
  AND lp.account_id = opens.account_id;

-- Raise peak from per-key borrow snapshots (captures leverage before mid-life repays).
UPDATE leveraged_positions lp
SET peak_borrow_quote = GREATEST(lp.peak_borrow_quote, kb.peak)
FROM (
    SELECT
        (le.parsed_json ->> 'account_id') AS account_id,
        (le.parsed_json ->> 'oracle_id')
            || ':'
            || (le.parsed_json ->> 'expiry_ms')
            || ':'
            || (le.parsed_json ->> 'strike')
            || ':'
            || (le.parsed_json ->> 'higher_strike')
            || ':'
            || CASE
                WHEN (le.parsed_json ->> 'is_up')::boolean THEN '1'
                ELSE '0'
            END
            || ':'
            || CASE
                WHEN (le.parsed_json ->> 'is_range')::boolean THEN '1'
                ELSE '0'
            END AS position_key,
        MAX((le.parsed_json ->> 'key_borrowed_quote')::bigint) AS peak
    FROM leverx_events le
    WHERE le.event_type = 'KeyBorrowUpdated'
    GROUP BY 1, 2
) kb
WHERE lp.position_key = kb.position_key
  AND lp.account_id = kb.account_id;

-- Fallback for rows without event history.
UPDATE leveraged_positions
SET peak_borrow_quote = GREATEST(
    peak_borrow_quote,
    borrow_quote,
    GREATEST(mint_cost - margin_quote, 0),
    GREATEST(close_debt_repaid - close_interest_paid, 0)
)
WHERE peak_borrow_quote = 0;
