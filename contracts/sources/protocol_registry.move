// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Global LeverX configuration: Predict link, vault, fee collector, trading pause.
module leverx::protocol_registry;

use deepbook_predict::predict::Predict;
use leverx::{
    protocol_constants,
    errors,
    events,
    fee_collector::{Self, FeeCollector},
    leverage_vault::LeverageVault,
    user_proxy::UserProxy,
};

// === Structs ===

/// Admin capability minted at publish; required for registry and protocol configuration.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared protocol registry linking Predict, vault, and fee collector.
public struct LeverxRegistry has key {
    id: UID,
    /// DeepBook Predict shared object ID used for leveraged prediction markets.
    predict_id: ID,
    /// Shared `LeverageVault` object ID holding quote liquidity and borrow state.
    vault_id: ID,
    /// Shared `FeeCollector` object ID for protocol treasury fees.
    fee_collector_id: ID,
    /// When true, user-facing trade and borrow entry points abort.
    trading_paused: bool,
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
        trading_paused: false,
    };
    let registry_id = object::id(&registry);
    events::emit_registry_initialized(registry_id, vault, fee_collector, predict_id);
    registry
}

/// Publish the registry as a shared object after one-time initialization.
public fun share_registry(registry: LeverxRegistry) {
    transfer::share_object(registry);
}

/// Emergency pause or resume leveraged trading across the protocol.
public fun set_trading_paused(_admin: &AdminCap, registry: &mut LeverxRegistry, paused: bool) {
    registry.trading_paused = paused;
    events::emit_trading_paused_changed(object::id(registry), paused);
}

/// Transaction entry: pause or resume leveraged trading.
public entry fun set_trading_paused_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    paused: bool,
) {
    set_trading_paused(admin, registry, paused);
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

/// Assert the vault object matches the registry deployment link.
public fun assert_vault<Quote>(registry: &LeverxRegistry, vault: &LeverageVault<Quote>) {
    assert!(object::id(vault) == registry.vault_id, errors::invalid_protocol_vault());
}

/// Assert the fee collector object matches the registry deployment link.
public fun assert_fee_collector<Quote>(registry: &LeverxRegistry, collector: &FeeCollector<Quote>) {
    assert!(object::id(collector) == registry.fee_collector_id, errors::invalid_fee_collector());
}

/// Assert the Predict shared object matches the registry deployment link.
public fun assert_predict(registry: &LeverxRegistry, predict: &Predict) {
    assert!(object::id(predict) == registry.predict_id, errors::invalid_predict());
}

#[test_only]
public fun create_for_testing(ctx: &mut TxContext): (AdminCap, LeverxRegistry) {
    let admin = AdminCap { id: object::new(ctx) };
    let registry = LeverxRegistry {
        id: object::new(ctx),
        predict_id: object::id_from_address(@0x1),
        vault_id: object::id_from_address(@0x2),
        fee_collector_id: object::id_from_address(@0x3),
        trading_paused: false,
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
