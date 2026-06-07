ALTER TABLE protocol_settings
    DROP COLUMN IF EXISTS predict_id,
    DROP COLUMN IF EXISTS fee_collector_id;
