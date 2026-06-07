ALTER TABLE protocol_settings
    ADD COLUMN IF NOT EXISTS predict_id TEXT,
    ADD COLUMN IF NOT EXISTS fee_collector_id TEXT;
