// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// User-facing take-profit and stop-loss trigger configuration on a UserProxy.
/// Premiums are DeepBook Predict 1e9-scaled per-contract values; keepers read them to auto-close positions.
module leverx::triggers;

use deepbook_predict::{market_key::MarketKey, predict_manager::PredictManager, range_key::RangeKey};
use leverx::{events, predict_client, user_proxy::UserProxy};

/// Wallet-friendly binary market path (call from PTB as a public function).
public fun set_automated_triggers_entry(
    proxy: &mut UserProxy,
    market_key: MarketKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
    ctx: &mut TxContext,
) {
    set_automated_triggers(proxy, market_key, take_profit_premium, stop_loss_premium, ctx);
}

/// Set take-profit and stop-loss premiums for a binary Predict market key.
/// Either premium may be zero to disable that side; emits `TriggersUpdated`.
public fun set_automated_triggers(
    proxy: &mut UserProxy,
    market_key: MarketKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
    ctx: &mut TxContext,
) {
    proxy.assert_owner(ctx);
    proxy.set_binary_triggers(market_key, take_profit_premium, stop_loss_premium);
    events::emit_triggers_updated(
        object::id(proxy),
        market_key.oracle_id(),
        false,
        take_profit_premium,
        stop_loss_premium,
    );
}

/// Remove binary-market triggers for `market_key` and emit `TriggersCleared`.
public fun clear_automated_triggers(
    proxy: &mut UserProxy,
    market_key: MarketKey,
    ctx: &mut TxContext,
) {
    proxy.assert_owner(ctx);
    proxy.clear_binary_triggers(market_key);
    events::emit_triggers_cleared(object::id(proxy), market_key.oracle_id(), false);
}

/// Set take-profit and stop-loss premiums for a range Predict market key.
public fun set_range_triggers(
    proxy: &mut UserProxy,
    range_key: RangeKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
    ctx: &mut TxContext,
) {
    proxy.assert_owner(ctx);
    proxy.set_range_triggers(range_key, take_profit_premium, stop_loss_premium);
    events::emit_triggers_updated(
        object::id(proxy),
        range_key.oracle_id(),
        true,
        take_profit_premium,
        stop_loss_premium,
    );
}

/// Remove range-market triggers for `range_key` and emit `TriggersCleared`.
public fun clear_range_triggers(
    proxy: &mut UserProxy,
    range_key: RangeKey,
    ctx: &mut TxContext,
) {
    proxy.assert_owner(ctx);
    proxy.clear_range_triggers(range_key);
    events::emit_triggers_cleared(object::id(proxy), range_key.oracle_id(), true);
}

/// Read binary-market `(take_profit_premium, stop_loss_premium)` — zeros if unset.
public fun get_triggers(proxy: &UserProxy, market_key: MarketKey): (u64, u64) {
    proxy.get_binary_triggers(market_key)
}

/// Read range-market `(take_profit_premium, stop_loss_premium)` — zeros if unset.
public fun get_range_triggers(proxy: &UserProxy, range_key: RangeKey): (u64, u64) {
    proxy.get_range_triggers(range_key)
}

/// Clear binary TP/SL when the Predict manager has no open contracts left on `key`.
public(package) fun maybe_clear_binary_triggers_if_flat(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
) {
    if (predict_client::manager_binary_position(manager, key) > 0) return;
    if (proxy.clear_binary_triggers_if_set(key)) {
        events::emit_triggers_cleared(object::id(proxy), key.oracle_id(), false);
    };
}

/// Clear range TP/SL when the Predict manager has no open contracts left on `key`.
public(package) fun maybe_clear_range_triggers_if_flat(
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
) {
    if (predict_client::manager_range_position(manager, key) > 0) return;
    if (proxy.clear_range_triggers_if_set(key)) {
        events::emit_triggers_cleared(object::id(proxy), key.oracle_id(), true);
    };
}
