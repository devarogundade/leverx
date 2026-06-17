ALTER TABLE leveraged_positions
    DROP COLUMN IF EXISTS close_source,
    DROP COLUMN IF EXISTS leverx_custody_complete,
    DROP COLUMN IF EXISTS external_redeem_payout_quote,
    DROP COLUMN IF EXISTS custody_recovered_quote;
