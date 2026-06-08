// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Global LeverX configuration: Predict link, vault, collateral LTV, swap pools.
module leverx::protocol_registry;

use leverx::{
    collateral_config::{Self, CollateralConfig},
    protocol_constants,
    errors,
    events,
    fee_collector::{Self, FeeCollector},
    leverage_vault::LeverageVault,
    user_proxy::UserProxy,
};
use std::type_name::{Self, TypeName};
use sui::table::{Self, Table};

// === Structs ===

/// Admin capability minted at publish; required for registry and protocol configuration.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared protocol registry linking Predict, vault, collateral LTV, and swap routing.
public struct LeverxRegistry has key {
    id: UID,
    /// DeepBook Predict shared object ID used for leveraged prediction markets.
    predict_id: ID,
    /// Shared `LeverageVault` object ID holding quote liquidity and borrow state.
    vault_id: ID,
    /// Shared `FeeCollector` object ID for protocol treasury fees.
    fee_collector_id: ID,
    /// Maximum Pyth price staleness (seconds) accepted for collateral valuation.
    pyth_max_age_secs: u64,
    /// When true, user-facing trade and borrow entry points abort.
    trading_paused: bool,
    /// Collateral asset type -> LTV / Pyth config.
    collaterals: Table<TypeName, CollateralConfig>,
    /// Registered collateral type names (table iteration is unavailable).
    collateral_assets: vector<TypeName>,
    /// Collateral asset type -> DeepBook spot pool for swap into quote.
    swap_pools: Table<TypeName, ID>,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    let admin = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin, ctx.sender());
}

// === Admin ===

/// One-time setup: create registry and link vault + Predict shared object.
public fun initialize(
    _admin: &AdminCap,
    predict_id: ID,
    vault: ID,
    fee_collector: ID,
    ctx: &mut TxContext,
): LeverxRegistry {
    let registry = LeverxRegistry {
        id: object::new(ctx),
        predict_id,
        vault_id: vault,
        fee_collector_id: fee_collector,
        pyth_max_age_secs: protocol_constants::default_pyth_max_age_secs(),
        trading_paused: false,
        collaterals: table::new(ctx),
        collateral_assets: vector[],
        swap_pools: table::new(ctx),
    };
    let registry_id = object::id(&registry);
    events::emit_registry_initialized(registry_id, vault, fee_collector, predict_id);
    registry
}

/// Publish the registry as a shared object after one-time initialization.
public fun share_registry(registry: LeverxRegistry) {
    transfer::share_object(registry);
}

/// Whitelist a collateral asset with Pyth feed and LTV parameters.
public fun whitelist_collateral_asset<Collateral>(
    _admin: &AdminCap,
    registry: &mut LeverxRegistry,
    price_feed_id: vector<u8>,
    decimals: u8,
    max_ltv_bps: u64,
    liquidation_ltv_bps: u64,
    max_conf_bps: u64,
) {
    let config = collateral_config::new(
        type_name::with_defining_ids<Collateral>(),
        decimals,
        price_feed_id,
        max_ltv_bps,
        liquidation_ltv_bps,
        max_conf_bps,
    );
    collateral_config::assert_valid(&config);
    register_collateral<Collateral>(_admin, registry, config);
}

/// Register a collateral asset with Pyth feed and LTV limits.
public fun register_collateral<Collateral>(
    _admin: &AdminCap,
    registry: &mut LeverxRegistry,
    config: CollateralConfig,
) {
    let asset = type_name::with_defining_ids<Collateral>();
    assert!(collateral_config::asset(&config) == asset, errors::collateral_not_supported());
    collateral_config::assert_valid(&config);
    if (registry.collaterals.contains(asset)) {
        let existing = registry.collaterals.borrow_mut(asset);
        *existing = config;
    } else {
        registry.collaterals.add(asset, config);
        registry.collateral_assets.push_back(asset);
    };
    events::emit_collateral_whitelisted(
        object::id(registry),
        asset,
        collateral_config::decimals(&config),
        collateral_config::max_ltv_bps(&config),
        collateral_config::liquidation_ltv_bps(&config),
        collateral_config::max_conf_bps(&config),
    );
}

/// Map a collateral asset to the DeepBook spot pool used to swap into quote (dUSDC).
public fun register_swap_pool<Collateral>(
    _admin: &AdminCap,
    registry: &mut LeverxRegistry,
    pool_id: ID,
) {
    let asset = type_name::with_defining_ids<Collateral>();
    assert!(registry.collaterals.contains(asset), errors::collateral_not_supported());
    if (registry.swap_pools.contains(asset)) {
        let existing = registry.swap_pools.borrow_mut(asset);
        *existing = pool_id;
    } else {
        registry.swap_pools.add(asset, pool_id);
    };
    events::emit_swap_pool_registered(object::id(registry), asset, pool_id);
}

/// Emergency pause or resume leveraged trading across the protocol.
public fun set_trading_paused(_admin: &AdminCap, registry: &mut LeverxRegistry, paused: bool) {
    registry.trading_paused = paused;
    events::emit_trading_paused_changed(object::id(registry), paused);
}

/// Update the maximum acceptable age for Pyth oracle prices used in LTV checks.
public fun set_pyth_max_age(_admin: &AdminCap, registry: &mut LeverxRegistry, max_age_secs: u64) {
    assert!(
        max_age_secs > 0 && max_age_secs <= protocol_constants::max_pyth_max_age_secs(),
        errors::invalid_pyth_price(),
    );
    registry.pyth_max_age_secs = max_age_secs;
    events::emit_pyth_max_age_updated(object::id(registry), max_age_secs);
}

/// Transaction entry: whitelist a collateral asset with Pyth feed and LTV parameters.
/// `max_ltv_bps` / `liquidation_ltv_bps` are per-asset (see deploy env catalog; not hardcoded).
public entry fun whitelist_collateral_entry<Collateral>(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    price_feed_id: vector<u8>,
    decimals: u8,
    max_ltv_bps: u64,
    liquidation_ltv_bps: u64,
    max_conf_bps: u64,
) {
    whitelist_collateral_asset<Collateral>(
        admin,
        registry,
        price_feed_id,
        decimals,
        max_ltv_bps,
        liquidation_ltv_bps,
        max_conf_bps,
    );
}

/// Transaction entry: register a DeepBook spot pool for collateral-to-quote swaps.
public entry fun register_swap_pool_entry<Collateral>(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    pool_id: ID,
) {
    register_swap_pool<Collateral>(admin, registry, pool_id);
}

/// Transaction entry: pause or resume leveraged trading.
public entry fun set_trading_paused_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    paused: bool,
) {
    set_trading_paused(admin, registry, paused);
}

/// Transaction entry: update the Pyth price staleness threshold.
public entry fun set_pyth_max_age_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    max_age_secs: u64,
) {
    set_pyth_max_age(admin, registry, max_age_secs);
}

/// Transaction entry: withdraw accumulated protocol fees from `FeeCollector`.
public entry fun withdraw_fee_collector_entry<Quote>(
    admin: &AdminCap,
    registry: &LeverxRegistry,
    collector: &mut FeeCollector<Quote>,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert!(object::id(collector) == registry.fee_collector_id, errors::invalid_manager());
    let coin = fee_collector::withdraw(collector, amount, ctx);
    transfer::public_transfer(coin, ctx.sender());
}

/// Grant a hot-wallet executor permission to act on a user's `UserProxy`.
/// Trusted-admin onboarding path — protocol admin only.
public fun register_executor_cap(
    _admin: &AdminCap,
    proxy: &mut UserProxy,
    executor: address,
) {
    proxy.register_executor_by_admin(executor);
}

/// Revoke executor permission from a user's `UserProxy`.
public fun revoke_executor_cap(
    _admin: &AdminCap,
    proxy: &mut UserProxy,
    executor: address,
) {
    proxy.revoke_executor_by_admin(executor);
}

/// Configure the vault kinked borrow curve and flash-loan fee (admin-only).
public fun set_borrow_rate_params<Quote>(
    _admin: &AdminCap,
    vault: &mut LeverageVault<Quote>,
    base_rate_bps: u64,
    kink_utilization_bps: u64,
    slope1_bps: u64,
    slope2_bps: u64,
    flash_fee_bps: u64,
) {
    assert!(kink_utilization_bps <= protocol_constants::bps(), errors::invalid_leverage());
    assert!(flash_fee_bps <= protocol_constants::bps(), errors::invalid_leverage());
    vault.set_borrow_rate_params(
        base_rate_bps,
        kink_utilization_bps,
        slope1_bps,
        slope2_bps,
        flash_fee_bps,
    );
    events::emit_borrow_rate_params_updated(
        object::id(vault),
        base_rate_bps,
        kink_utilization_bps,
        slope1_bps,
        slope2_bps,
        flash_fee_bps,
    );
}

// === Read API ===

/// DeepBook Predict shared object ID registered at initialization.
public fun predict_id(registry: &LeverxRegistry): ID {
    registry.predict_id
}

/// Shared `LeverageVault` object ID for quote liquidity and borrows.
public fun vault_id(registry: &LeverxRegistry): ID {
    registry.vault_id
}

/// Shared `FeeCollector` object ID for protocol treasury fees.
public fun fee_collector_id(registry: &LeverxRegistry): ID {
    registry.fee_collector_id
}

/// Whether leveraged trading entry points are currently paused.
public fun trading_paused(registry: &LeverxRegistry): bool {
    registry.trading_paused
}

/// Maximum Pyth price age (seconds) enforced during collateral valuation.
public fun pyth_max_age_secs(registry: &LeverxRegistry): u64 {
    registry.pyth_max_age_secs
}

/// Wider Pyth staleness bound used for liquidation eligibility (reduces bad debt during oracle stalls).
public fun liquidation_pyth_max_age_secs(registry: &LeverxRegistry): u64 {
    let trading = registry.pyth_max_age_secs;
    let liquidation = protocol_constants::liquidation_pyth_max_age_secs();
    if (trading > liquidation) trading else liquidation
}

/// Assert the vault object matches the registry deployment link.
public fun assert_vault<Quote>(registry: &LeverxRegistry, vault: &LeverageVault<Quote>) {
    assert!(object::id(vault) == registry.vault_id, errors::invalid_protocol_vault());
}

/// Assert the fee collector object matches the registry deployment link.
public fun assert_fee_collector<Quote>(registry: &LeverxRegistry, collector: &FeeCollector<Quote>) {
    assert!(object::id(collector) == registry.fee_collector_id, errors::invalid_fee_collector());
}

/// LTV and Pyth feed configuration for a whitelisted collateral `Asset`.
public fun collateral_config<Asset>(registry: &LeverxRegistry): CollateralConfig {
    let asset = type_name::with_defining_ids<Asset>();
    assert!(registry.collaterals.contains(asset), errors::collateral_not_supported());
    *registry.collaterals.borrow(asset)
}

/// DeepBook spot pool ID used to swap `Collateral` into quote during liquidation.
public fun swap_pool_id<Collateral>(registry: &LeverxRegistry): ID {
    let asset = type_name::with_defining_ids<Collateral>();
    assert!(registry.swap_pools.contains(asset), errors::invalid_swap_pool());
    *registry.swap_pools.borrow(asset)
}

/// All whitelisted collateral configs (table keys are not iterable on-chain).
public fun collateral_configs(registry: &LeverxRegistry): vector<CollateralConfig> {
    let mut configs = vector[];
    let mut i = 0;
    let len = registry.collateral_assets.length();
    while (i < len) {
        let asset = registry.collateral_assets[i];
        configs.push_back(*registry.collaterals.borrow(asset));
        i = i + 1;
    };
    configs
}

#[test_only]
public fun create_for_testing(ctx: &mut TxContext): (AdminCap, LeverxRegistry) {
    let admin = AdminCap { id: object::new(ctx) };
    let registry = LeverxRegistry {
        id: object::new(ctx),
        predict_id: object::id_from_address(@0x1),
        vault_id: object::id_from_address(@0x2),
        fee_collector_id: object::id_from_address(@0x3),
        pyth_max_age_secs: protocol_constants::default_pyth_max_age_secs(),
        trading_paused: false,
        collaterals: table::new(ctx),
        collateral_assets: vector[],
        swap_pools: table::new(ctx),
    };
    (admin, registry)
}

#[test_only]
public fun link_vault_for_testing(
    registry: &mut LeverxRegistry,
    vault_id: ID,
    fee_collector_id: ID,
) {
    registry.vault_id = vault_id;
    registry.fee_collector_id = fee_collector_id;
}
