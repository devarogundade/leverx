// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Per-user account object for LeverX leveraged prediction trading.
///
/// # Proxy-per-user pattern
/// Each trader receives one shared `UserProxy` object at onboarding. The proxy is the
/// single custody surface for that user's assets, authorization state, and per-market
/// accounting. Protocol modules (`trade`, `liquidation`, `ltv`, etc.) mutate the proxy
/// on behalf of the owner or registered executors; end users never hold raw DeepBook caps.
///
/// # Per-market-key ledgers
/// Quote margin is **not** fungible across markets. For every binary
/// `MarketKey` or range `RangeKey`, the proxy maintains:
/// - A `PositionLedger` (`quote_balance`, `borrowed_quote`, `margin_debt`)
/// - Optional `TriggerConfig` (take-profit / stop-loss premiums)
/// - At most one resting `PendingLimitMintOrder`
///
/// Deposits land in the in-proxy `BalanceManager` first, then credit the
/// appropriate market-key ledger. Withdrawals and liquidations debit the ledger before
/// pulling coins from the balance manager.
///
/// # Balance manager integration
/// On creation, the proxy initializes an embedded `BalanceManager` owned by the proxy
/// object address, plus `DepositCap` and `WithdrawCap`. Physical coin
/// storage lives in the balance manager; ledgers track logical allocation.
module leverx::user_proxy;

use deepbook_predict::{market_key::MarketKey, range_key::RangeKey};
use leverx::{
    errors,
    events,
    ltv,
    protocol_constants,
    proxy_vault::{Self, BalanceManager, DepositCap, WithdrawCap},
};
use sui::{
    clock::Clock,
    coin::{Self, Coin},
    table::{Self, Table},
    transfer,
    vec_set::{Self, VecSet},
};

/// Take-profit and stop-loss trigger thresholds for a single market key.
///
/// Premiums are expressed in the same units as predict-market ask prices; keepers compare
/// live market premium against these values to fire automated exits.
public struct TriggerConfig has copy, drop, store {
    /// Premium at or above which a take-profit close is eligible.
    take_profit_premium: u64,
    /// Premium at or below which a stop-loss close is eligible.
    stop_loss_premium: u64,
    /// Redeem slippage tolerance (bps) when take-profit fires (`0` → protocol default).
    take_profit_slippage_bps: u64,
    /// Redeem slippage tolerance (bps) when stop-loss fires (`0` → protocol default).
    stop_loss_slippage_bps: u64,
}

/// Per-market-key quote margin and vault debt — not shared across keys.
public struct PositionLedger has store {
    /// Quote tokens allocated to this market key (margin, proceeds, reserved limit margin).
    quote_balance: u64,
    /// Quote borrowed from the protocol vault for this market key (subset of proxy total).
    borrowed_quote: u64,
    /// Posted margin requirement for leveraged health checks (zero at 1x).
    margin_debt: u64,
    /// Current position leverage in basis points (10_000 = 1x, no vault borrow).
    leverage_bps: u64,
    /// When true, force-deleverage may remint a 1x position from free quote after repay.
    remint_after_deleverage: bool,
}

/// Resting leveraged mint limit order — slippage is frozen at placement for keeper fills.
public struct PendingLimitMintOrder has copy, drop, store {
    /// Maximum premium per unit the user is willing to pay on fill.
    limit_premium_per_unit: u64,
    /// Slippage tolerance in basis points, fixed at order placement.
    slippage_bps: u64,
    /// Market ask premium snapshot when the order was placed (slippage reference).
    market_ask_at_place: u64,
    /// Quote margin locked for this order.
    margin_quote: u64,
    /// Desired leverage in basis points (10_000 = 1×).
    leverage_bps: u64,
    /// Number of outcome units to mint on fill.
    quantity: u64,
    /// Unix timestamp (ms) after which the order may not be filled.
    expires_ms: u64,
    /// Unix timestamp (ms) when the order was placed.
    placed_at_ms: u64,
    /// Address that placed the order (owner or registered executor).
    placed_by: address,
    /// Remint 1x after deleverage when the resting order fills.
    remint_after_deleverage: bool,
}

/// Shared on-chain account for one LeverX user.
///
/// Owns an embedded balance manager for physical custody and maintains logical ledgers
/// keyed by binary `MarketKey` and range `RangeKey`.
public struct UserProxy has key {
    /// Unique object identifier for this proxy.
    id: UID,
    /// Human owner; required for admin actions and executor registration.
    owner: address,
    /// Linked DeepBook Predict manager object used for market routing.
    predict_manager_id: ID,
    /// Aggregate quote borrowed across all market keys (sum of ledger `borrowed_quote`).
    borrowed_quote: u64,
    /// Embedded balance manager holding all physical coins for this user.
    balance_manager: BalanceManager,
    /// Capability to deposit coins into `balance_manager`.
    deposit_cap: DepositCap,
    /// Capability to withdraw coins from `balance_manager`.
    withdraw_cap: WithdrawCap,
    /// Session executors (e.g. bot keys) allowed to act alongside the owner.
    executors: VecSet<address>,
    /// Quote/debt ledgers indexed by binary market key.
    binary_ledgers: Table<MarketKey, PositionLedger>,
    /// Quote/debt ledgers indexed by range market key.
    range_ledgers: Table<RangeKey, PositionLedger>,
    /// Take-profit / stop-loss config for binary markets.
    binary_triggers: Table<MarketKey, TriggerConfig>,
    /// Take-profit / stop-loss config for range markets.
    range_triggers: Table<RangeKey, TriggerConfig>,
    /// At most one resting limit mint order per binary market key.
    binary_limit_mints: Table<MarketKey, PendingLimitMintOrder>,
    /// At most one resting limit mint order per range market key.
    range_limit_mints: Table<RangeKey, PendingLimitMintOrder>,
}

// === Account factory ===

/// Create and share a new `UserProxy` for `ctx.sender()`.
///
/// Initializes an embedded balance manager owned by the proxy object address and
/// empty ledger tables. Emits `AccountCreated`.
public fun create(predict_manager_id: ID, ctx: &mut TxContext) {
    let id = object::new(ctx);
    let owner = ctx.sender();

    let (balance_manager, deposit_cap, withdraw_cap    ) = proxy_vault::new_with_owner_caps(id.to_address(), ctx);

    let proxy = UserProxy {
        id,
        owner,
        predict_manager_id,
        borrowed_quote: 0,
        balance_manager,
        deposit_cap,
        withdraw_cap,
        executors: vec_set::empty(),
        binary_ledgers: table::new(ctx),
        range_ledgers: table::new(ctx),
        binary_triggers: table::new(ctx),
        range_triggers: table::new(ctx),
        binary_limit_mints: table::new(ctx),
        range_limit_mints: table::new(ctx),
    };

    events::emit_account_created(object::id(&proxy), owner, predict_manager_id);
    transfer::share_object(proxy);
}

/// Update the linked Predict manager ID. Owner-only.
public fun link_predict_manager(proxy: &mut UserProxy, manager_id: ID, ctx: &TxContext) {
    proxy.assert_owner(ctx);
    proxy.predict_manager_id = manager_id;
    events::emit_predict_manager_linked(object::id(proxy), proxy.owner, manager_id);
}

/// Grant an executor address permission to act on this proxy. Owner-only.
public fun register_executor_cap(proxy: &mut UserProxy, executor: address, ctx: &TxContext) {
    proxy.assert_owner(ctx);
    proxy.executors.insert(executor);
    events::emit_executor_registered(object::id(proxy), executor);
}

/// Revoke a previously registered executor. Owner-only.
public fun revoke_executor_cap(proxy: &mut UserProxy, executor: address, ctx: &TxContext) {
    proxy.assert_owner(ctx);
    proxy.executors.remove(&executor);
    events::emit_executor_revoked(object::id(proxy), executor);
}

/// Protocol admin may register a session executor (e.g. Telegram bot key).
public(package) fun register_executor_by_admin(proxy: &mut UserProxy, executor: address) {
    proxy.executors.insert(executor);
    events::emit_executor_registered(object::id(proxy), executor);
}

/// Protocol admin may revoke a session executor without owner signature.
public(package) fun revoke_executor_by_admin(proxy: &mut UserProxy, executor: address) {
    proxy.executors.remove(&executor);
    events::emit_executor_revoked(object::id(proxy), executor);
}

// === Read-only getters ===

/// Return the human owner of this proxy.
public fun owner(proxy: &UserProxy): address {
    proxy.owner
}

/// Return the linked DeepBook Predict manager object ID.
public fun predict_manager_id(proxy: &UserProxy): ID {
    proxy.predict_manager_id
}

/// Return total quote borrowed across all market keys.
public fun borrowed_quote(proxy: &UserProxy): u64 {
    proxy.borrowed_quote
}

/// Return the physical balance of `Asset` in the balance manager (all keys combined).
public fun balance<Asset>(proxy: &UserProxy): u64 {
    proxy.balance_manager.balance<Asset>()
}

/// Return quote allocated to a binary market key, or `0` if no ledger exists.
public fun binary_quote_balance(proxy: &UserProxy, key: MarketKey): u64 {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).quote_balance
    } else {
        0
    }
}

/// Return quote allocated to a range market key, or `0` if no ledger exists.
public fun range_quote_balance(proxy: &UserProxy, key: RangeKey): u64 {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).quote_balance
    } else {
        0
    }
}

/// Return quote borrowed for a binary market key, or `0` if no ledger exists.
public fun binary_borrowed_quote(proxy: &UserProxy, key: MarketKey): u64 {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).borrowed_quote
    } else {
        0
    }
}

/// Return quote borrowed for a range market key, or `0` if no ledger exists.
public fun range_borrowed_quote(proxy: &UserProxy, key: RangeKey): u64 {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).borrowed_quote
    } else {
        0
    }
}

/// Return posted margin debt for a binary market key (1x margin-call denominator).
public fun binary_margin_debt(proxy: &UserProxy, key: MarketKey): u64 {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).margin_debt
    } else {
        0
    }
}

/// Return posted margin debt for a range market key (1x margin-call denominator).
public fun range_margin_debt(proxy: &UserProxy, key: RangeKey): u64 {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).margin_debt
    } else {
        0
    }
}

/// Return leverage in basis points for a binary market key (10_000 = 1x).
public fun binary_leverage_bps(proxy: &UserProxy, key: MarketKey): u64 {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).leverage_bps
    } else {
        protocol_constants::bps()
    }
}

/// Return leverage in basis points for a range market key (10_000 = 1x).
public fun range_leverage_bps(proxy: &UserProxy, key: RangeKey): u64 {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).leverage_bps
    } else {
        protocol_constants::bps()
    }
}

/// Return whether force-deleverage should remint 1x for a binary key (default true).
public fun binary_remint_after_deleverage(proxy: &UserProxy, key: MarketKey): bool {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow(key).remint_after_deleverage
    } else {
        true
    }
}

/// Return whether force-deleverage should remint 1x for a range key (default true).
public fun range_remint_after_deleverage(proxy: &UserProxy, key: RangeKey): bool {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow(key).remint_after_deleverage
    } else {
        true
    }
}

/// Return TP/SL premiums and slippage bps for a binary key (zeros when unset).
public fun get_binary_triggers(proxy: &UserProxy, key: MarketKey): (u64, u64, u64, u64) {
    if (proxy.binary_triggers.contains(key)) {
        let t = proxy.binary_triggers.borrow(key);
        (
            t.take_profit_premium,
            t.stop_loss_premium,
            t.take_profit_slippage_bps,
            t.stop_loss_slippage_bps,
        )
    } else {
        (0, 0, 0, 0)
    }
}

/// Return TP/SL premiums and slippage bps for a range key (zeros when unset).
public fun get_range_triggers(proxy: &UserProxy, key: RangeKey): (u64, u64, u64, u64) {
    if (proxy.range_triggers.contains(key)) {
        let t = proxy.range_triggers.borrow(key);
        (
            t.take_profit_premium,
            t.stop_loss_premium,
            t.take_profit_slippage_bps,
            t.stop_loss_slippage_bps,
        )
    } else {
        (0, 0, 0, 0)
    }
}

// === User deposits ===

/// Deposit quote for a binary market: physical deposit + ledger credit. Owner or executor.
public fun deposit_quote_for_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
    credit_binary_quote(proxy, key, amount, ctx);
}

/// Deposit quote for a range market: physical deposit + ledger credit. Owner or executor.
public fun deposit_quote_for_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    let amount = coin.value();
    assert!(amount > 0, errors::zero_amount());
    proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
    credit_range_quote(proxy, key, amount, ctx);
}

// === Protocol quote credit ===

/// Credit quote proceeds to a binary market key (protocol — no auth check).
public(package) fun credit_quote_for_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    let amount = coin.value();
    if (amount > 0) {
        proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
        credit_binary_quote(proxy, key, amount, ctx);
    } else {
        coin::destroy_zero(coin);
    };
}

/// Credit quote proceeds to a range market key (protocol — no auth check).
public(package) fun credit_quote_for_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    coin: Coin<Quote>,
    ctx: &mut TxContext,
) {
    let amount = coin.value();
    if (amount > 0) {
        proxy.balance_manager.deposit_with_cap(&proxy.deposit_cap, coin, ctx);
        credit_range_quote(proxy, key, amount, ctx);
    } else {
        coin::destroy_zero(coin);
    };
}

// === Protocol withdrawals ===

/// Debit binary quote ledger and withdraw matching coins from the balance manager.
public(package) fun withdraw_quote_from_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    debit_binary_quote(proxy, key, amount, 0);
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Debit binary quote for funding a mint; `slippage_bps` tolerates rapid market moves vs quote.
public(package) fun withdraw_quote_from_binary_with_slippage<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    slippage_bps: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    debit_binary_quote(proxy, key, amount, slippage_bps);
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Debit range quote ledger and withdraw matching coins from the balance manager.
public(package) fun withdraw_quote_from_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    debit_range_quote(proxy, key, amount, 0);
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Debit range quote for funding a mint; `slippage_bps` tolerates rapid market moves vs quote.
public(package) fun withdraw_quote_from_range_with_slippage<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    slippage_bps: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    debit_range_quote(proxy, key, amount, slippage_bps);
    proxy.balance_manager.withdraw_with_cap(&proxy.withdraw_cap, amount, ctx)
}

/// Withdraw free quote from a binary market key to the transaction sender.
public fun withdraw_quote_for_binary<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    assert!(amount > 0, errors::zero_amount());
    assert!(proxy.binary_borrowed_quote(key) == 0, errors::outstanding_debt());
    let coin = proxy.withdraw_quote_from_binary<Quote>(key, amount, ctx);
    transfer::public_transfer(coin, ctx.sender());
}

/// Withdraw free quote from a range market key to the transaction sender.
public fun withdraw_quote_for_range<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    proxy.assert_can_act(ctx);
    assert!(amount > 0, errors::zero_amount());
    assert!(proxy.range_borrowed_quote(key) == 0, errors::outstanding_debt());
    let coin = proxy.withdraw_quote_from_range<Quote>(key, amount, ctx);
    transfer::public_transfer(coin, ctx.sender());
}

// === Quote reserve (limit orders) ===

/// Lock quote margin for a resting limit order on this binary market key.
public(package) fun reserve_binary_quote(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    _ctx: &mut TxContext,
) {
    debit_binary_quote(proxy, key, amount, 0);
}

/// Lock quote margin for a resting limit order on this range market key.
public(package) fun reserve_range_quote(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    _ctx: &mut TxContext,
) {
    debit_range_quote(proxy, key, amount, 0);
}

/// Return reserved quote to the binary ledger (cancel / expire path).
public(package) fun release_binary_quote_reserve(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    credit_binary_quote(proxy, key, amount, ctx);
}

/// Return reserved quote to the range ledger (cancel / expire path).
public(package) fun release_range_quote_reserve(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    credit_range_quote(proxy, key, amount, ctx);
}

// === Borrow / repay accounting ===

/// Record vault borrow debt on a binary market key (physical quote credited separately).
public(package) fun record_borrow_for_binary(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.borrowed_quote = ledger.borrowed_quote + amount;
    proxy.borrowed_quote = proxy.borrowed_quote + amount;
}

/// Record vault borrow debt on a range market key (physical quote credited separately).
public(package) fun record_borrow_for_range(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.borrowed_quote = ledger.borrowed_quote + amount;
    proxy.borrowed_quote = proxy.borrowed_quote + amount;
}

/// Record partial or full repayment of binary-market vault debt.
public(package) fun record_repay_for_binary(proxy: &mut UserProxy, key: MarketKey, amount: u64) {
    assert!(proxy.binary_ledgers.contains(key), errors::outstanding_debt());
    let ledger = proxy.binary_ledgers.borrow_mut(key);
    assert!(amount <= ledger.borrowed_quote, errors::outstanding_debt());
    ledger.borrowed_quote = ledger.borrowed_quote - amount;
    proxy.borrowed_quote = proxy.borrowed_quote - amount;
}

/// Record partial or full repayment of range-market vault debt.
public(package) fun record_repay_for_range(proxy: &mut UserProxy, key: RangeKey, amount: u64) {
    assert!(proxy.range_ledgers.contains(key), errors::outstanding_debt());
    let ledger = proxy.range_ledgers.borrow_mut(key);
    assert!(amount <= ledger.borrowed_quote, errors::outstanding_debt());
    ledger.borrowed_quote = ledger.borrowed_quote - amount;
    proxy.borrowed_quote = proxy.borrowed_quote - amount;
}

/// Record posted margin for margin-call health on a binary key.
public(package) fun set_binary_margin_debt(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.margin_debt = amount;
}

/// Add posted margin for margin-call health on a binary key (scale-in).
public(package) fun add_binary_margin_debt(
    proxy: &mut UserProxy,
    key: MarketKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.margin_debt = ledger.margin_debt + amount;
}

/// Record posted margin for margin-call health on a range key.
public(package) fun set_range_margin_debt(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.margin_debt = amount;
}

/// Add posted margin for margin-call health on a range key (scale-in).
public(package) fun add_range_margin_debt(
    proxy: &mut UserProxy,
    key: RangeKey,
    amount: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.margin_debt = ledger.margin_debt + amount;
}

/// Clear posted margin debt on a binary key after the position is closed.
public(package) fun clear_binary_margin_debt(proxy: &mut UserProxy, key: MarketKey) {
    if (proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.borrow_mut(key).margin_debt = 0;
    };
}

/// Clear posted margin debt on a range key after the position is closed.
public(package) fun clear_range_margin_debt(proxy: &mut UserProxy, key: RangeKey) {
    if (proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.borrow_mut(key).margin_debt = 0;
    };
}

/// Set leverage for a binary market key.
public(package) fun set_binary_leverage(
    proxy: &mut UserProxy,
    key: MarketKey,
    leverage_bps: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.leverage_bps = leverage_bps;
    if (!ltv::is_leveraged(leverage_bps)) {
        ledger.margin_debt = 0;
    };
}

/// Set leverage for a range market key.
public(package) fun set_range_leverage(
    proxy: &mut UserProxy,
    key: RangeKey,
    leverage_bps: u64,
    ctx: &mut TxContext,
) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.leverage_bps = leverage_bps;
    if (!ltv::is_leveraged(leverage_bps)) {
        ledger.margin_debt = 0;
    };
}

/// Set post-deleverage remint preference for a binary market key.
public(package) fun set_binary_remint_after_deleverage(
    proxy: &mut UserProxy,
    key: MarketKey,
    remint_after_deleverage: bool,
    ctx: &mut TxContext,
) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.remint_after_deleverage = remint_after_deleverage;
}

/// Set post-deleverage remint preference for a range market key.
public(package) fun set_range_remint_after_deleverage(
    proxy: &mut UserProxy,
    key: RangeKey,
    remint_after_deleverage: bool,
    ctx: &mut TxContext,
) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.remint_after_deleverage = remint_after_deleverage;
}

/// Reset binary key to unleveraged (1x) after full vault debt repayment.
public(package) fun reset_binary_to_unleveraged(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    set_binary_leverage(proxy, key, protocol_constants::bps(), ctx);
}

/// Reset range key to unleveraged (1x) after full vault debt repayment.
public(package) fun reset_range_to_unleveraged(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    set_range_leverage(proxy, key, protocol_constants::bps(), ctx);
}

/// Transfer all free quote on a binary key to `recipient` when vault debt is zero.
public(package) fun sweep_binary_free_quote_to<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    recipient: address,
    ctx: &mut TxContext,
) {
    if (proxy.binary_borrowed_quote(key) > 0) return;
    let free = proxy.binary_quote_balance(key);
    if (free == 0) return;
    let coin = withdraw_quote_from_binary<Quote>(proxy, key, free, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Transfer all free quote on a binary key to `ctx.sender()` when vault debt is zero.
public(package) fun sweep_binary_free_quote_to_sender<Quote>(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    sweep_binary_free_quote_to<Quote>(proxy, key, ctx.sender(), ctx);
}

/// Transfer all free quote on a range key to `recipient` when vault debt is zero.
public(package) fun sweep_range_free_quote_to<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    recipient: address,
    ctx: &mut TxContext,
) {
    if (proxy.range_borrowed_quote(key) > 0) return;
    let free = proxy.range_quote_balance(key);
    if (free == 0) return;
    let coin = withdraw_quote_from_range<Quote>(proxy, key, free, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Transfer all free quote on a range key to `ctx.sender()` when vault debt is zero.
public(package) fun sweep_range_free_quote_to_sender<Quote>(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    sweep_range_free_quote_to<Quote>(proxy, key, ctx.sender(), ctx);
}

// === Ledger ops (internal) ===

fun ensure_binary_ledger(
    proxy: &mut UserProxy,
    key: MarketKey,
    _ctx: &mut TxContext,
): &mut PositionLedger {
    if (!proxy.binary_ledgers.contains(key)) {
        proxy.binary_ledgers.add(key, PositionLedger {
            quote_balance: 0,
            borrowed_quote: 0,
            margin_debt: 0,
            leverage_bps: protocol_constants::bps(),
            remint_after_deleverage: true,
        });
    };
    proxy.binary_ledgers.borrow_mut(key)
}

fun ensure_range_ledger(
    proxy: &mut UserProxy,
    key: RangeKey,
    _ctx: &mut TxContext,
): &mut PositionLedger {
    if (!proxy.range_ledgers.contains(key)) {
        proxy.range_ledgers.add(key, PositionLedger {
            quote_balance: 0,
            borrowed_quote: 0,
            margin_debt: 0,
            leverage_bps: protocol_constants::bps(),
            remint_after_deleverage: true,
        });
    };
    proxy.range_ledgers.borrow_mut(key)
}

/// Increase binary quote ledger balance; creates the ledger if missing.
fun credit_binary_quote(proxy: &mut UserProxy, key: MarketKey, amount: u64, ctx: &mut TxContext) {
    let ledger = ensure_binary_ledger(proxy, key, ctx);
    ledger.quote_balance = ledger.quote_balance + amount;
}

/// Increase range quote ledger balance; creates the ledger if missing.
fun credit_range_quote(proxy: &mut UserProxy, key: RangeKey, amount: u64, ctx: &mut TxContext) {
    let ledger = ensure_range_ledger(proxy, key, ctx);
    ledger.quote_balance = ledger.quote_balance + amount;
}

/// Decrease binary quote ledger balance; aborts if insufficient or ledger missing.
fun debit_binary_quote(proxy: &mut UserProxy, key: MarketKey, amount: u64, _slippage_bps: u64) {
    assert!(proxy.binary_ledgers.contains(key), errors::insufficient_margin());
    let ledger = proxy.binary_ledgers.borrow_mut(key);
    assert!(ledger.quote_balance >= amount, errors::insufficient_margin());
    ledger.quote_balance = ledger.quote_balance - amount;
}

/// Decrease range quote ledger balance; aborts if insufficient or ledger missing.
fun debit_range_quote(proxy: &mut UserProxy, key: RangeKey, amount: u64, _slippage_bps: u64) {
    assert!(proxy.range_ledgers.contains(key), errors::insufficient_margin());
    let ledger = proxy.range_ledgers.borrow_mut(key);
    assert!(ledger.quote_balance >= amount, errors::insufficient_margin());
    ledger.quote_balance = ledger.quote_balance - amount;
}

// === Triggers ===

/// Set or update take-profit / stop-loss premiums for a binary market key.
public(package) fun set_binary_triggers(
    proxy: &mut UserProxy,
    key: MarketKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
    take_profit_slippage_bps: u64,
    stop_loss_slippage_bps: u64,
) {
    let tp_slippage = normalize_trigger_slippage_bps(take_profit_premium, take_profit_slippage_bps);
    let sl_slippage = normalize_trigger_slippage_bps(stop_loss_premium, stop_loss_slippage_bps);
    if (proxy.binary_triggers.contains(key)) {
        let t = proxy.binary_triggers.borrow_mut(key);
        t.take_profit_premium = take_profit_premium;
        t.stop_loss_premium = stop_loss_premium;
        t.take_profit_slippage_bps = tp_slippage;
        t.stop_loss_slippage_bps = sl_slippage;
    } else {
        proxy.binary_triggers.add(key, TriggerConfig {
            take_profit_premium,
            stop_loss_premium,
            take_profit_slippage_bps: tp_slippage,
            stop_loss_slippage_bps: sl_slippage,
        });
    };
}

/// Remove trigger config for a binary market key.
public(package) fun clear_binary_triggers(proxy: &mut UserProxy, key: MarketKey) {
    assert!(proxy.binary_triggers.contains(key), errors::trigger_not_found());
    proxy.binary_triggers.remove(key);
}

/// Remove binary triggers when present; returns `true` if a row was removed.
public(package) fun clear_binary_triggers_if_set(proxy: &mut UserProxy, key: MarketKey): bool {
    if (!proxy.binary_triggers.contains(key)) return false;
    proxy.binary_triggers.remove(key);
    true
}

/// Set or update take-profit / stop-loss premiums for a range market key.
public(package) fun set_range_triggers(
    proxy: &mut UserProxy,
    key: RangeKey,
    take_profit_premium: u64,
    stop_loss_premium: u64,
    take_profit_slippage_bps: u64,
    stop_loss_slippage_bps: u64,
) {
    let tp_slippage = normalize_trigger_slippage_bps(take_profit_premium, take_profit_slippage_bps);
    let sl_slippage = normalize_trigger_slippage_bps(stop_loss_premium, stop_loss_slippage_bps);
    if (proxy.range_triggers.contains(key)) {
        let t = proxy.range_triggers.borrow_mut(key);
        t.take_profit_premium = take_profit_premium;
        t.stop_loss_premium = stop_loss_premium;
        t.take_profit_slippage_bps = tp_slippage;
        t.stop_loss_slippage_bps = sl_slippage;
    } else {
        proxy.range_triggers.add(key, TriggerConfig {
            take_profit_premium,
            stop_loss_premium,
            take_profit_slippage_bps: tp_slippage,
            stop_loss_slippage_bps: sl_slippage,
        });
    };
}

/// Remove trigger config for a range market key.
public(package) fun clear_range_triggers(proxy: &mut UserProxy, key: RangeKey) {
    assert!(proxy.range_triggers.contains(key), errors::trigger_not_found());
    proxy.range_triggers.remove(key);
}

/// Remove range triggers when present; returns `true` if a row was removed.
public(package) fun clear_range_triggers_if_set(proxy: &mut UserProxy, key: RangeKey): bool {
    if (!proxy.range_triggers.contains(key)) return false;
    proxy.range_triggers.remove(key);
    true
}

// === Limit mint orders ===

/// Return the resting limit mint order for a binary key, if any.
public fun get_binary_limit_mint(proxy: &UserProxy, key: MarketKey): Option<PendingLimitMintOrder> {
    if (proxy.binary_limit_mints.contains(key)) {
        option::some(*proxy.binary_limit_mints.borrow(key))
    } else {
        option::none()
    }
}

/// Return the resting limit mint order for a range key, if any.
public fun get_range_limit_mint(proxy: &UserProxy, key: RangeKey): Option<PendingLimitMintOrder> {
    if (proxy.range_limit_mints.contains(key)) {
        option::some(*proxy.range_limit_mints.borrow(key))
    } else {
        option::none()
    }
}

/// Store a new resting limit mint order for a binary key (one per key).
public(package) fun place_binary_limit_mint(
    proxy: &mut UserProxy,
    key: MarketKey,
    order: PendingLimitMintOrder,
) {
    assert!(!proxy.binary_limit_mints.contains(key), errors::limit_order_exists());
    proxy.binary_limit_mints.add(key, order);
}

/// Store a new resting limit mint order for a range key (one per key).
public(package) fun place_range_limit_mint(
    proxy: &mut UserProxy,
    key: RangeKey,
    order: PendingLimitMintOrder,
) {
    assert!(!proxy.range_limit_mints.contains(key), errors::limit_order_exists());
    proxy.range_limit_mints.add(key, order);
}

/// Remove and return a binary limit mint order (keeper fill path).
public(package) fun take_binary_limit_mint(
    proxy: &mut UserProxy,
    key: MarketKey,
): PendingLimitMintOrder {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.binary_limit_mints.remove(key)
}

/// Remove and return a range limit mint order (keeper fill path).
public(package) fun take_range_limit_mint(
    proxy: &mut UserProxy,
    key: RangeKey,
): PendingLimitMintOrder {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.range_limit_mints.remove(key)
}

/// Remove and return a binary limit mint order (user cancel path).
public(package) fun cancel_binary_limit_mint(
    proxy: &mut UserProxy,
    key: MarketKey,
): PendingLimitMintOrder {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.binary_limit_mints.remove(key)
}

/// Remove and return a range limit mint order (user cancel path).
public(package) fun cancel_range_limit_mint(
    proxy: &mut UserProxy,
    key: RangeKey,
): PendingLimitMintOrder {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    proxy.range_limit_mints.remove(key)
}

/// Cancel a resting binary limit order and release reserved margin (liquidation prep).
public(package) fun cancel_binary_limit_mint_for_liquidation(
    proxy: &mut UserProxy,
    key: MarketKey,
    ctx: &mut TxContext,
) {
    if (proxy.binary_limit_mints.contains(key)) {
        let order = proxy.cancel_binary_limit_mint(key);
        release_binary_quote_reserve(
            proxy,
            key,
            margin_quote(&order),
            ctx,
        );
    };
}

/// Cancel a resting range limit order and release reserved margin (liquidation prep).
public(package) fun cancel_range_limit_mint_for_liquidation(
    proxy: &mut UserProxy,
    key: RangeKey,
    ctx: &mut TxContext,
) {
    if (proxy.range_limit_mints.contains(key)) {
        let order = proxy.cancel_range_limit_mint(key);
        release_range_quote_reserve(
            proxy,
            key,
            margin_quote(&order),
            ctx,
        );
    };
}

// === PendingLimitMintOrder getters ===

/// Return the limit premium per unit stored on the order.
public fun limit_premium_per_unit(order: &PendingLimitMintOrder): u64 {
    order.limit_premium_per_unit
}

/// Return slippage tolerance in basis points.
public fun slippage_bps(order: &PendingLimitMintOrder): u64 {
    order.slippage_bps
}

/// Return the market ask premium at order placement.
public fun market_ask_at_place(order: &PendingLimitMintOrder): u64 {
    order.market_ask_at_place
}

/// Return locked quote margin for the order.
public fun margin_quote(order: &PendingLimitMintOrder): u64 {
    order.margin_quote
}

/// Return desired leverage in basis points.
public fun leverage_bps(order: &PendingLimitMintOrder): u64 {
    order.leverage_bps
}

/// Return whether to remint 1x after a future force-deleverage.
public fun remint_after_deleverage(order: &PendingLimitMintOrder): bool {
    order.remint_after_deleverage
}

/// Return outcome units to mint on fill.
public fun quantity(order: &PendingLimitMintOrder): u64 {
    order.quantity
}

/// Return expiry timestamp in milliseconds.
public fun expires_ms(order: &PendingLimitMintOrder): u64 {
    order.expires_ms
}

/// Abort if the binary limit mint order is past its expiry.
public(package) fun assert_binary_limit_mint_not_expired(
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
) {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    let order = proxy.binary_limit_mints.borrow(key);
    assert!(clock.timestamp_ms() <= order.expires_ms, errors::limit_order_expired());
}

/// Abort if the range limit mint order is past its expiry.
public(package) fun assert_range_limit_mint_not_expired(
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
) {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    let order = proxy.range_limit_mints.borrow(key);
    assert!(clock.timestamp_ms() <= order.expires_ms, errors::limit_order_expired());
}

/// Abort unless the binary limit mint order has expired (permissionless release path).
public(package) fun assert_binary_limit_mint_expired(
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
) {
    assert!(proxy.binary_limit_mints.contains(key), errors::limit_order_not_found());
    let order = proxy.binary_limit_mints.borrow(key);
    assert!(clock.timestamp_ms() > order.expires_ms, errors::limit_order_still_active());
}

/// Abort unless the range limit mint order has expired (permissionless release path).
public(package) fun assert_range_limit_mint_expired(
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
) {
    assert!(proxy.range_limit_mints.contains(key), errors::limit_order_not_found());
    let order = proxy.range_limit_mints.borrow(key);
    assert!(clock.timestamp_ms() > order.expires_ms, errors::limit_order_still_active());
}

/// Construct a `PendingLimitMintOrder` value (protocol placement helper).
public(package) fun new_pending_limit_mint_order(
    limit_premium_per_unit: u64,
    slippage_bps: u64,
    market_ask_at_place: u64,
    margin_quote: u64,
    leverage_bps: u64,
    quantity: u64,
    expires_ms: u64,
    placed_at_ms: u64,
    placed_by: address,
    remint_after_deleverage: bool,
): PendingLimitMintOrder {
    PendingLimitMintOrder {
        limit_premium_per_unit,
        slippage_bps,
        market_ask_at_place,
        margin_quote,
        leverage_bps,
        quantity,
        expires_ms,
        placed_at_ms,
        placed_by,
        remint_after_deleverage,
    }
}

// === Access control ===

/// Abort unless `ctx.sender()` is the proxy owner.
public(package) fun assert_owner(proxy: &UserProxy, ctx: &TxContext) {
    assert!(ctx.sender() == proxy.owner, errors::not_owner());
}

/// True when sender is the owner or a registered executor.
public(package) fun can_act(proxy: &UserProxy, ctx: &TxContext): bool {
    ctx.sender() == proxy.owner || proxy.executors.contains(&ctx.sender())
}

/// Abort unless sender is the owner or a registered executor.
public(package) fun assert_can_act(proxy: &UserProxy, ctx: &TxContext) {
    assert!(can_act(proxy, ctx), errors::not_authorized());
}

/// Abort unless sender can act, or automated triggers are configured for the binary key.
public(package) fun assert_can_act_or_has_binary_trigger(
    proxy: &UserProxy,
    key: MarketKey,
    ctx: &TxContext,
) {
    if (can_act(proxy, ctx)) return;
    assert!(proxy.binary_triggers.contains(key), errors::not_authorized());
    let t = proxy.binary_triggers.borrow(key);
    assert!(
        t.take_profit_premium > 0 || t.stop_loss_premium > 0,
        errors::trigger_not_found(),
    );
}

/// Abort unless sender can act, or automated triggers are configured for the range key.
public(package) fun assert_can_act_or_has_range_trigger(
    proxy: &UserProxy,
    key: RangeKey,
    ctx: &TxContext,
) {
    if (can_act(proxy, ctx)) return;
    assert!(proxy.range_triggers.contains(key), errors::not_authorized());
    let t = proxy.range_triggers.borrow(key);
    assert!(
        t.take_profit_premium > 0 || t.stop_loss_premium > 0,
        errors::trigger_not_found(),
    );
}

/// Keeper redeem: market bid must cross configured take-profit or stop-loss.
public(package) fun assert_binary_trigger_threshold_met(
    proxy: &UserProxy,
    key: MarketKey,
    market_bid: u64,
) {
    let t = proxy.binary_triggers.borrow(key);
    let tp_met = t.take_profit_premium > 0 && market_bid >= t.take_profit_premium;
    let sl_met = t.stop_loss_premium > 0 && market_bid <= t.stop_loss_premium;
    assert!(tp_met || sl_met, errors::trigger_threshold_not_met());
}

/// Keeper redeem: market bid must cross configured take-profit or stop-loss.
public(package) fun assert_range_trigger_threshold_met(
    proxy: &UserProxy,
    key: RangeKey,
    market_bid: u64,
) {
    let t = proxy.range_triggers.borrow(key);
    let tp_met = t.take_profit_premium > 0 && market_bid >= t.take_profit_premium;
    let sl_met = t.stop_loss_premium > 0 && market_bid <= t.stop_loss_premium;
    assert!(tp_met || sl_met, errors::trigger_threshold_not_met());
}

/// Slippage bps for the trigger side crossed by `market_bid` (TP preferred when both match).
public(package) fun binary_trigger_slippage_bps_for_bid(
    proxy: &UserProxy,
    key: MarketKey,
    market_bid: u64,
): u64 {
    let t = proxy.binary_triggers.borrow(key);
    let tp_met = t.take_profit_premium > 0 && market_bid >= t.take_profit_premium;
    let sl_met = t.stop_loss_premium > 0 && market_bid <= t.stop_loss_premium;
    assert!(tp_met || sl_met, errors::trigger_threshold_not_met());
    if (tp_met) {
        effective_trigger_slippage_bps(t.take_profit_premium, t.take_profit_slippage_bps)
    } else {
        effective_trigger_slippage_bps(t.stop_loss_premium, t.stop_loss_slippage_bps)
    }
}

/// Slippage bps for the trigger side crossed by `market_bid` (TP preferred when both match).
public(package) fun range_trigger_slippage_bps_for_bid(
    proxy: &UserProxy,
    key: RangeKey,
    market_bid: u64,
): u64 {
    let t = proxy.range_triggers.borrow(key);
    let tp_met = t.take_profit_premium > 0 && market_bid >= t.take_profit_premium;
    let sl_met = t.stop_loss_premium > 0 && market_bid <= t.stop_loss_premium;
    assert!(tp_met || sl_met, errors::trigger_threshold_not_met());
    if (tp_met) {
        effective_trigger_slippage_bps(t.take_profit_premium, t.take_profit_slippage_bps)
    } else {
        effective_trigger_slippage_bps(t.stop_loss_premium, t.stop_loss_slippage_bps)
    }
}

/// Keeper redeem: `min_payout` must respect configured trigger slippage.
public(package) fun assert_binary_trigger_redeem_slippage(
    proxy: &UserProxy,
    key: MarketKey,
    market_bid: u64,
    min_payout: u64,
    expected_payout: u64,
) {
    let slippage_bps = binary_trigger_slippage_bps_for_bid(proxy, key, market_bid);
    assert_trigger_redeem_min_payout(min_payout, expected_payout, slippage_bps);
}

/// Keeper redeem: `min_payout` must respect configured trigger slippage.
public(package) fun assert_range_trigger_redeem_slippage(
    proxy: &UserProxy,
    key: RangeKey,
    market_bid: u64,
    min_payout: u64,
    expected_payout: u64,
) {
    let slippage_bps = range_trigger_slippage_bps_for_bid(proxy, key, market_bid);
    assert_trigger_redeem_min_payout(min_payout, expected_payout, slippage_bps);
}

fun normalize_trigger_slippage_bps(premium: u64, slippage_bps: u64): u64 {
    if (premium == 0) return 0;
    if (slippage_bps == 0) return protocol_constants::default_trigger_slippage_bps();
    assert!(
        slippage_bps <= protocol_constants::max_limit_order_slippage_bps(),
        errors::slippage_too_high(),
    );
    slippage_bps
}

fun effective_trigger_slippage_bps(premium: u64, slippage_bps: u64): u64 {
    if (premium == 0) return 0;
    if (slippage_bps == 0) protocol_constants::default_trigger_slippage_bps() else slippage_bps
}

fun assert_trigger_redeem_min_payout(min_payout: u64, expected_payout: u64, slippage_bps: u64) {
    let floor = if (expected_payout == 0 || slippage_bps == 0) {
        0
    } else {
        let factor = protocol_constants::bps() - slippage_bps;
        protocol_constants::mul_bps(expected_payout, factor)
    };
    assert!(min_payout >= floor, errors::slippage_exceeded());
    if (min_payout > 0) {
        assert!(expected_payout >= min_payout, errors::slippage_exceeded());
    };
}

// === Test helpers ===

/// Build an in-memory proxy for unit tests only.
#[test_only]
public fun create_for_testing(
    owner: address,
    predict_manager_id: ID,
    ctx: &mut TxContext,
): UserProxy {
    let id = object::new(ctx);
    let (balance_manager, deposit_cap, withdraw_cap    ) = proxy_vault::new_with_owner_caps(id.to_address(), ctx);

    UserProxy {
        id,
        owner,
        predict_manager_id,
        borrowed_quote: 0,
        balance_manager,
        deposit_cap,
        withdraw_cap,
        executors: vec_set::empty(),
        binary_ledgers: table::new(ctx),
        range_ledgers: table::new(ctx),
        binary_triggers: table::new(ctx),
        range_triggers: table::new(ctx),
        binary_limit_mints: table::new(ctx),
        range_limit_mints: table::new(ctx),
    }
}
