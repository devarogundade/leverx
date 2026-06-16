ALTER TABLE protocol_settings
    ADD COLUMN IF NOT EXISTS final_window_ms BIGINT;
