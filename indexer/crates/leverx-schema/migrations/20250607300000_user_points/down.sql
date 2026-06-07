DROP TABLE IF EXISTS user_points;

ALTER TABLE liquidations
    ADD CONSTRAINT fk_liquidations_asset
    FOREIGN KEY (collateral_asset) REFERENCES collateral_assets (coin_type)
    DEFERRABLE INITIALLY DEFERRED;
