// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Pyth-backed collateral valuation and LTV checks for cross-collateral margin.
module leverx::ltv;

use leverx::{
    collateral_config::{Self, CollateralConfig},
    protocol_constants,
    errors,
    protocol_registry::LeverxRegistry,
};
use pyth::{price_info::PriceInfoObject, pyth};
use std::{type_name::{Self, TypeName}, u128};
use sui::clock::Clock;

/// Decimal and Pyth price context for converting between asset atoms and USD/quote.
public struct ConversionConfig has copy, drop {
    /// Output denomination decimals (USD or quote asset).
    target_decimals: u8,
    /// Input denomination decimals (collateral or USD).
    base_decimals: u8,
    /// Validated positive Pyth price magnitude.
    pyth_price: u64,
    /// Negative Pyth exponent magnitude used for scaling.
    pyth_decimals: u8,
}

/// Value `amount` of `Collateral` in `Quote` atoms (e.g. dUSDC with 6 decimals).
public fun collateral_value_in_quote<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    amount: u64,
    clock: &Clock,
): u64 {
    collateral_value_in_quote_with_max_age<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        amount,
        registry.pyth_max_age_secs(),
        clock,
    )
}

/// Collateral→quote valuation with an explicit Pyth staleness bound.
public fun collateral_value_in_quote_with_max_age<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    amount: u64,
    max_age_secs: u64,
    clock: &Clock,
): u64 {
    let collateral_usd = usd_value_with_max_age<Collateral>(
        registry,
        collateral_oracle,
        amount,
        max_age_secs,
        clock,
    );
    quote_amount_from_usd_with_max_age<Quote>(
        registry,
        quote_oracle,
        collateral_usd,
        max_age_secs,
        clock,
    )
}

/// Maximum borrow in quote atoms supported by `collateral_amount` at max LTV.
public fun max_borrow_quote<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    collateral_amount: u64,
    clock: &Clock,
): u64 {
    let config = registry.collateral_config<Collateral>();
    let collateral_quote = collateral_value_in_quote<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        collateral_amount,
        clock,
    );
    mul_bps(collateral_quote, collateral_config::max_ltv_bps(&config))
}

/// Returns true when `borrow_quote` is within LTV for the posted collateral.
public fun is_borrow_allowed<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    collateral_amount: u64,
    borrow_quote: u64,
    clock: &Clock,
): bool {
    borrow_quote <= max_borrow_quote<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        collateral_amount,
        clock,
    )
}

/// Assert borrow is within max LTV; aborts with `ELtvExceeded` otherwise.
public fun assert_borrow_allowed<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    collateral_amount: u64,
    borrow_quote: u64,
    clock: &Clock,
) {
    assert!(
        is_borrow_allowed<Collateral, Quote>(
            registry,
            collateral_oracle,
            quote_oracle,
            collateral_amount,
            borrow_quote,
            clock,
        ),
        errors::ltv_exceeded(),
    );
}

/// Assert `existing_borrowed + new_borrow` is within max LTV for stacked positions.
public fun assert_incremental_borrow_allowed<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    collateral_amount: u64,
    existing_borrowed_quote: u64,
    new_borrow_quote: u64,
    clock: &Clock,
) {
    assert_borrow_allowed<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        collateral_amount,
        existing_borrowed_quote + new_borrow_quote,
        clock,
    );
}

/// Compute borrow amount for a leveraged trade: `position_quote - margin_quote`.
public fun borrow_for_leverage(position_quote: u64, margin_quote: u64): u64 {
    assert!(position_quote >= margin_quote, errors::invalid_leverage());
    position_quote - margin_quote
}

/// Position size from margin and leverage bps (e.g. 2x = 20_000 bps).
public fun position_from_margin(margin_quote: u64, leverage_bps: u64): u64 {
    mul_bps(margin_quote, leverage_bps)
}

/// Multiply `amount` by basis points (10_000 = 100%).
public fun mul_bps(amount: u64, bps: u64): u64 {
    protocol_constants::mul_bps(amount, bps)
}

/// Health factor in bps: `((collateral_value + quote_balance) * BPS) / debt`.
public fun evaluate_account_health<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_amount: u64,
    quote_balance: u64,
    borrowed_quote: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
): u64 {
    evaluate_account_health_with_max_age<Collateral, Quote>(
        registry,
        collateral_amount,
        quote_balance,
        borrowed_quote,
        collateral_oracle,
        quote_oracle,
        registry.pyth_max_age_secs(),
        clock,
    )
}

/// Health factor with an explicit Pyth staleness bound.
public fun evaluate_account_health_with_max_age<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_amount: u64,
    quote_balance: u64,
    borrowed_quote: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    max_age_secs: u64,
    clock: &Clock,
): u64 {
    if (borrowed_quote == 0) return protocol_constants::bps() * 10;
    let collateral_quote = collateral_value_in_quote_with_max_age<Collateral, Quote>(
        registry,
        collateral_oracle,
        quote_oracle,
        collateral_amount,
        max_age_secs,
        clock,
    );
    let backing = collateral_quote + quote_balance;
    if (backing == 0) return 0;
    backing * protocol_constants::bps() / borrowed_quote
}

/// Liquidation health check with an explicit Pyth staleness bound (wider during oracle stalls).
public fun is_liquidatable_with_max_age<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_amount: u64,
    quote_balance: u64,
    borrowed_quote: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    max_age_secs: u64,
    clock: &Clock,
): bool {
    let health = evaluate_account_health_with_max_age<Collateral, Quote>(
        registry,
        collateral_amount,
        quote_balance,
        borrowed_quote,
        collateral_oracle,
        quote_oracle,
        max_age_secs,
        clock,
    );
    let config = registry.collateral_config<Collateral>();
    health < collateral_config::liquidation_ltv_bps(&config)
}

/// Assert collateral withdrawal leaves health at or above liquidation LTV.
public fun assert_withdraw_allowed<Collateral, Quote>(
    registry: &LeverxRegistry,
    collateral_amount: u64,
    quote_balance: u64,
    withdraw_amount: u64,
    borrowed_quote: u64,
    collateral_oracle: &PriceInfoObject,
    quote_oracle: &PriceInfoObject,
    clock: &Clock,
) {
    let remaining = collateral_amount - withdraw_amount;
    let health = evaluate_account_health<Collateral, Quote>(
        registry,
        remaining,
        quote_balance,
        borrowed_quote,
        collateral_oracle,
        quote_oracle,
        clock,
    );
    let config = registry.collateral_config<Collateral>();
    assert!(
        health >= collateral_config::liquidation_ltv_bps(&config),
        errors::withdraw_exceeds_maintenance(),
    );
}

fun usd_value_with_max_age<Asset>(
    registry: &LeverxRegistry,
    price_info: &PriceInfoObject,
    amount: u64,
    max_age_secs: u64,
    clock: &Clock,
): u64 {
    let config = conversion_config_with_max_age<Asset>(
        registry,
        price_info,
        true,
        max_age_secs,
        clock,
    );
    convert_amount(config, amount)
}

fun quote_amount_from_usd_with_max_age<Quote>(
    registry: &LeverxRegistry,
    quote_oracle: &PriceInfoObject,
    usd_amount: u64,
    max_age_secs: u64,
    clock: &Clock,
): u64 {
    let config = conversion_config_with_max_age<Quote>(
        registry,
        quote_oracle,
        false,
        max_age_secs,
        clock,
    );
    convert_amount_inverse(config, usd_amount)
}

fun conversion_config_with_max_age<Asset>(
    registry: &LeverxRegistry,
    price_info: &PriceInfoObject,
    to_usd: bool,
    max_age_secs: u64,
    clock: &Clock,
): ConversionConfig {
    let collateral = registry.collateral_config<Asset>();
    let (pyth_price, pyth_decimals, pyth_conf) = validated_pyth_price(
        registry,
        price_info,
        &collateral,
        max_age_secs,
        clock,
    );
    assert!(
        (pyth_conf as u128) * (protocol_constants::bps() as u128)
            <= (collateral_config::max_conf_bps(&collateral) as u128) * (pyth_price as u128),
        errors::invalid_pyth_price(),
    );

    let target_decimals = if (to_usd) {
        protocol_constants::usd_decimals()
    } else {
        collateral_config::decimals(&collateral)
    };
    let base_decimals = if (to_usd) {
        collateral_config::decimals(&collateral)
    } else {
        protocol_constants::usd_decimals()
    };

    ConversionConfig {
        target_decimals,
        base_decimals,
        pyth_price,
        pyth_decimals,
    }
}

/// Compute 10^exp as u128 for decimal scaling (max exponent 38).
fun pow10(exp: u64): u128 {
    assert!(exp <= 38, errors::invalid_pyth_price());
    u128::pow(10u128, (exp as u8))
}

/// Scale `base_amount` from base decimals to target decimals using Pyth price.
fun convert_amount(config: ConversionConfig, base_amount: u64): u64 {
    assert!(config.pyth_price > 0, errors::invalid_pyth_price());
    let exponent_with_buffer =
        (protocol_constants::pyth_exponent_buffer() as u64) + (config.base_decimals as u64)
            - (config.target_decimals as u64);
    let numerator = (base_amount as u128) * (config.pyth_price as u128);
    let scaled = numerator / pow10(config.pyth_decimals as u64);
    let buffered = scaled * pow10(protocol_constants::pyth_exponent_buffer() as u64);
    (buffered / pow10(exponent_with_buffer)) as u64
}

/// Inverse of `convert_amount`: target atoms back to base atoms via Pyth price.
fun convert_amount_inverse(config: ConversionConfig, target_amount: u64): u64 {
    assert!(config.pyth_price > 0, errors::invalid_pyth_price());
    let exponent_with_buffer = (protocol_constants::pyth_exponent_buffer() as u64)
        + (config.target_decimals as u64)
        + (config.pyth_decimals as u64)
        - (config.base_decimals as u64);
    let numerator = (target_amount as u128) * pow10(exponent_with_buffer);
    let price_scaled = u128::divide_and_round_up(numerator, config.pyth_price as u128);
    u128::divide_and_round_up(
        price_scaled,
        pow10(protocol_constants::pyth_exponent_buffer() as u64),
    ) as u64
}

/// Fetch a fresh Pyth price and verify feed ID matches collateral config.
fun validated_pyth_price(
    registry: &LeverxRegistry,
    price_info: &PriceInfoObject,
    config: &CollateralConfig,
    max_age_secs: u64,
    clock: &Clock,
): (u64, u8, u64) {
    let price = pyth::get_price_no_older_than(
        price_info,
        clock,
        max_age_secs,
    );
    let info = price_info.get_price_info_from_price_info_object();
    assert!(
        info.get_price_identifier().get_bytes() == collateral_config::price_feed_id(config),
        errors::price_feed_mismatch(),
    );

    let pyth_price = price.get_price().get_magnitude_if_positive();
    let pyth_decimals = price.get_expo().get_magnitude_if_negative() as u8;
    let pyth_conf = price.get_conf();

    (pyth_price, pyth_decimals, pyth_conf)
}

#[test_only]
public fun test_collateral_config<Asset>(
    decimals: u8,
    price_feed_id: vector<u8>,
    max_ltv_bps: u64,
): CollateralConfig {
    collateral_config::new(
        type_name::with_defining_ids<Asset>(),
        decimals,
        price_feed_id,
        max_ltv_bps,
        max_ltv_bps + 500,
        1_000,
    )
}

#[test_only]
public fun test_conversion_config(
    target_decimals: u8,
    base_decimals: u8,
    pyth_price: u64,
    pyth_decimals: u8,
): ConversionConfig {
    ConversionConfig {
        target_decimals,
        base_decimals,
        pyth_price,
        pyth_decimals,
    }
}

#[test_only]
public fun test_convert_amount(config: ConversionConfig, amount: u64): u64 {
    convert_amount(config, amount)
}

#[test_only]
public fun test_convert_amount_inverse(config: ConversionConfig, amount: u64): u64 {
    convert_amount_inverse(config, amount)
}

#[test_only]
public fun test_mul_bps(amount: u64, bps: u64): u64 {
    mul_bps(amount, bps)
}
