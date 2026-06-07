// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Collateral whitelist config — standalone module to avoid registry/ltv cycle.
///
/// Each whitelisted asset stores its own `max_ltv_bps` / `liquidation_ltv_bps` (not global constants).
/// Initial launch collateral and LTV targets are configured via admin `whitelist_collateral_entry`
/// and documented in deploy env files (BTC 80%, SUI 70%, dUSDC 100%, DEEP 60%).
module leverx::collateral_config;

use std::type_name::TypeName;

/// Per-asset collateral parameters stored in the protocol registry.
public struct CollateralConfig has copy, drop, store {
    /// On-chain type of the collateral coin.
    asset: TypeName,
    /// Token decimal places for amount normalization.
    decimals: u8,
    /// Pyth price feed identifier (32-byte ID).
    price_feed_id: vector<u8>,
    /// Max loan-to-value in bps — new borrows rejected above this.
    max_ltv_bps: u64,
    /// LTV in bps at which liquidation may begin.
    liquidation_ltv_bps: u64,
    /// Maximum acceptable Pyth confidence interval in bps of price.
    max_conf_bps: u64,
}

/// Build a collateral config snapshot for registry insertion.
public fun new(
    asset: TypeName,
    decimals: u8,
    price_feed_id: vector<u8>,
    max_ltv_bps: u64,
    liquidation_ltv_bps: u64,
    max_conf_bps: u64,
): CollateralConfig {
    CollateralConfig {
        asset,
        decimals,
        price_feed_id,
        max_ltv_bps,
        liquidation_ltv_bps,
        max_conf_bps,
    }
}

/// Collateral coin type for this config entry.
public fun asset(config: &CollateralConfig): TypeName {
    config.asset
}

/// Decimal precision used when valuing this collateral.
public fun decimals(config: &CollateralConfig): u8 {
    config.decimals
}

/// Pyth feed ID used to price this asset during LTV checks.
public fun price_feed_id(config: &CollateralConfig): vector<u8> {
    config.price_feed_id
}

/// Borrow cap as a fraction of collateral value (basis points).
public fun max_ltv_bps(config: &CollateralConfig): u64 {
    config.max_ltv_bps
}

/// Health threshold triggering liquidation eligibility (basis points).
public fun liquidation_ltv_bps(config: &CollateralConfig): u64 {
    config.liquidation_ltv_bps
}

/// Upper bound on Pyth price uncertainty before the feed is rejected.
public fun max_conf_bps(config: &CollateralConfig): u64 {
    config.max_conf_bps
}

/// Reject misconfigured LTV / confidence parameters at whitelist time.
public fun assert_valid(config: &CollateralConfig) {
    use leverx::{errors, protocol_constants};
    let bps = protocol_constants::bps();
    assert!(config.max_ltv_bps > 0 && config.max_ltv_bps <= bps, errors::invalid_collateral_config());
    assert!(
        config.liquidation_ltv_bps >= config.max_ltv_bps && config.liquidation_ltv_bps <= bps,
        errors::invalid_collateral_config(),
    );
    assert!(config.max_conf_bps > 0 && config.max_conf_bps <= bps, errors::invalid_collateral_config());
}
