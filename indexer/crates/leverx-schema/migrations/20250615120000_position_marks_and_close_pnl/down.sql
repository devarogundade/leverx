ALTER TABLE leveraged_positions
    DROP COLUMN IF EXISTS close_surplus_quote,
    DROP COLUMN IF EXISTS close_interest_paid,
    DROP COLUMN IF EXISTS close_debt_repaid,
    DROP COLUMN IF EXISTS closing_mark,
    DROP COLUMN IF EXISTS entry_mark;
