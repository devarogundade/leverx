DROP INDEX IF EXISTS idx_liquidations_event_kind;

ALTER TABLE liquidations DROP COLUMN IF EXISTS event_kind;
ALTER TABLE vault_snapshots DROP COLUMN IF EXISTS insurance_fund_delta;
ALTER TABLE protocol_settings DROP COLUMN IF EXISTS liquidation_bps;
