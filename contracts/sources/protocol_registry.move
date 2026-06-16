// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Global LeverX configuration: Predict link, vault, fee collector, trading pause.
module leverx::protocol_registry;

use deepbook_predict::{predict::Predict, predict_manager::PredictManager};
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
    /// Liquidate when position health (bps) falls below this threshold (default 9_500 = 95%).
    liquidation_bps: u64,
    /// Final window before expiry (ms): block >1x mints; allow force-deleverage.
    final_window_ms: u64,
    /// Protocol keeper relayer; owns per-user Predict managers and signs maintenance PTBs.
    keeper_address: address,
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
        liquidation_bps: protocol_constants::default_liquidation_bps(),
        final_window_ms: protocol_constants::default_final_window_ms(),
        keeper_address: @0x0,
    };
    let registry_id = object::id(&registry);
    events::emit_registry_initialized(
        registry_id,
        vault,
        fee_collector,
        predict_id,
        registry.liquidation_bps,
        registry.final_window_ms,
    );
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

/// Update the liquidation health threshold (liquidate when health < `liquidation_bps`; max 150%).
public fun set_liquidation_bps(
    _admin: &AdminCap,
    registry: &mut LeverxRegistry,
    liquidation_bps: u64,
) {
    protocol_constants::assert_liquidation_bps(liquidation_bps);
    registry.liquidation_bps = liquidation_bps;
    events::emit_liquidation_bps_updated(object::id(registry), liquidation_bps);
}

/// Update the final window before expiry (block >1x mints; force-deleverage window).
public fun set_final_window_ms(
    _admin: &AdminCap,
    registry: &mut LeverxRegistry,
    final_window_ms: u64,
) {
    protocol_constants::assert_final_window_ms(final_window_ms);
    registry.final_window_ms = final_window_ms;
    events::emit_final_window_updated(object::id(registry), final_window_ms);
}

/// Transaction entry: update final window before expiry.
public entry fun set_final_window_ms_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    final_window_ms: u64,
) {
    set_final_window_ms(admin, registry, final_window_ms);
}

/// Transaction entry: update liquidation health threshold.
public entry fun set_liquidation_bps_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    liquidation_bps: u64,
) {
    set_liquidation_bps(admin, registry, liquidation_bps);
}

/// Transaction entry: pause or resume leveraged trading.
public entry fun set_trading_paused_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    paused: bool,
) {
    set_trading_paused(admin, registry, paused);
}

/// Set the protocol keeper relayer address (owns Predict managers for leveraged users).
public fun set_keeper_address(
    _admin: &AdminCap,
    registry: &mut LeverxRegistry,
    keeper_address: address,
) {
    assert!(keeper_address != @0x0, errors::keeper_not_configured());
    registry.keeper_address = keeper_address;
    events::emit_keeper_address_updated(object::id(registry), keeper_address);
}

/// Transaction entry: set the protocol keeper relayer address.
public entry fun set_keeper_address_entry(
    admin: &AdminCap,
    registry: &mut LeverxRegistry,
    keeper_address: address,
) {
    set_keeper_address(admin, registry, keeper_address);
}

/// Transaction entry: withdraw accumulated protocol fees from `FeeCollector`.
public entry fun withdraw_fee_collector_entry<Quote>(
    _admin: &AdminCap,
    registry: &LeverxRegistry,
    collector: &mut FeeCollector<Quote>,
    amount: u64,
    ctx: &mut TxContext,
) {
    assert_fee_collector(registry, collector);
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
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    base_rate_bps: u64,
    kink_utilization_bps: u64,
    slope1_bps: u64,
    slope2_bps: u64,
    flash_fee_bps: u64,
) {
    assert_vault(registry, vault);
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

/// Liquidation health threshold in basis points (liquidate when health < this).
public fun liquidation_bps(registry: &LeverxRegistry): u64 {
    registry.liquidation_bps
}

/// Final window before expiry in milliseconds.
public fun final_window_ms(registry: &LeverxRegistry): u64 {
    registry.final_window_ms
}

/// Protocol keeper relayer address (`@0x0` when unset).
public fun keeper_address(registry: &LeverxRegistry): address {
    registry.keeper_address
}

/// Abort unless `manager` is owned by the configured protocol keeper.
public fun assert_keeper_managed_manager(registry: &LeverxRegistry, manager: &PredictManager) {
    let keeper = registry.keeper_address;
    assert!(keeper != @0x0, errors::keeper_not_configured());
    assert!(manager.owner() == keeper, errors::invalid_manager());
}

/// Abort unless `ctx.sender()` is the configured protocol keeper.
public fun assert_keeper(registry: &LeverxRegistry, ctx: &TxContext) {
    let keeper = registry.keeper_address;
    assert!(keeper != @0x0, errors::keeper_not_configured());
    assert!(ctx.sender() == keeper, errors::not_keeper());
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
        liquidation_bps: protocol_constants::default_liquidation_bps(),
        final_window_ms: protocol_constants::default_final_window_ms(),
        keeper_address: @0x0,
    };
    (admin, registry)
}

#[test_only]
public fun set_keeper_address_for_testing(registry: &mut LeverxRegistry, keeper_address: address) {
    registry.keeper_address = keeper_address;
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
