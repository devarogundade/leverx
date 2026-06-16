use std::str::FromStr;

use anyhow::{Context, Result};
use sui_types::base_types::ObjectID;

/// Default published leverx package on testnet (see `contracts/deploy-testnet.env`).
const DEFAULT_LEVERX_PACKAGE_ID: &str =
    "0x972b59d3ee7c74a01d88d0b2d895d0f6ce58fc68fdead02c974ad824bfd6b790";

/// Default testnet `deepbook_predict` package (`contracts/Move.toml` published-at).
const DEFAULT_PREDICT_PACKAGE_ID: &str =
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";

#[derive(Clone, Debug)]
pub struct LeverxConfig {
    pub package_id: ObjectID,
    pub predict_package_id: ObjectID,
}

impl LeverxConfig {
    pub fn from_env() -> Result<Self> {
        let raw = std::env::var("LEVERX_PACKAGE_ID")
            .unwrap_or_else(|_| DEFAULT_LEVERX_PACKAGE_ID.to_string());
        let package_id = ObjectID::from_str(raw.trim())
            .context("invalid LEVERX_PACKAGE_ID")?;

        let predict_raw = std::env::var("PREDICT_PACKAGE_ID")
            .unwrap_or_else(|_| DEFAULT_PREDICT_PACKAGE_ID.to_string());
        let predict_package_id = ObjectID::from_str(predict_raw.trim())
            .context("invalid PREDICT_PACKAGE_ID")?;

        Ok(Self {
            package_id,
            predict_package_id,
        })
    }
}
