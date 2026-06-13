-- Breaking contract/indexer alignment: RegistryInitialized.liquidation_bps, insurance fund tracking.

ALTER TABLE protocol_settings
    ADD COLUMN IF NOT EXISTS liquidation_bps BIGINT;

ALTER TABLE vault_snapshots
    ADD COLUMN IF NOT EXISTS insurance_fund_delta BIGINT;

ALTER TABLE liquidations
    ADD COLUMN IF NOT EXISTS event_kind TEXT NOT NULL DEFAULT 'liquidation';

CREATE INDEX IF NOT EXISTS idx_liquidations_event_kind ON liquidations (event_kind);
