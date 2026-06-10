// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// In-proxy coin custody for `UserProxy` — no DeepBook registry or app authorization.
module leverx::proxy_vault;

use sui::{
    bag::{Self, Bag},
    balance::Balance,
    coin::Coin,
};

const E_INVALID_CAP: u64 = 1;
const E_INSUFFICIENT_BALANCE: u64 = 2;

public struct BalanceKey has copy, drop, store {}

/// Per-proxy physical coin balances, owned by the embedding `UserProxy` object address.
public struct BalanceManager has store {
    owner: address,
    balances: Bag,
}

public struct DepositCap has copy, drop, store {
    owner: address,
}

public struct WithdrawCap has copy, drop, store {
    owner: address,
}

/// Create a balance manager and caps for a custom owner (the proxy object address).
public fun new_with_owner_caps(
    owner: address,
    ctx: &mut TxContext,
): (BalanceManager, DepositCap, WithdrawCap) {
    let balance_manager = BalanceManager {
        owner,
        balances: bag::new(ctx),
    };
    let deposit_cap = DepositCap { owner };
    let withdraw_cap = WithdrawCap { owner };
    (balance_manager, deposit_cap, withdraw_cap)
}

public fun balance<Asset>(balance_manager: &BalanceManager): u64 {
    let key = BalanceKey {};
    if (!balance_manager.balances.contains(key)) {
        0
    } else {
        let acc: &Balance<Asset> = &balance_manager.balances[key];
        acc.value()
    }
}

public fun deposit_with_cap<Asset>(
    balance_manager: &mut BalanceManager,
    deposit_cap: &DepositCap,
    coin: Coin<Asset>,
    _ctx: &TxContext,
) {
    assert!(deposit_cap.owner == balance_manager.owner, E_INVALID_CAP);
    let key = BalanceKey {};
    if (balance_manager.balances.contains(key)) {
        let acc: &mut Balance<Asset> = &mut balance_manager.balances[key];
        acc.join(coin.into_balance());
    } else {
        balance_manager.balances.add(key, coin.into_balance());
    }
}

public fun withdraw_with_cap<Asset>(
    balance_manager: &mut BalanceManager,
    withdraw_cap: &WithdrawCap,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Asset> {
    assert!(withdraw_cap.owner == balance_manager.owner, E_INVALID_CAP);
    let key = BalanceKey {};
    assert!(balance_manager.balances.contains(key), E_INSUFFICIENT_BALANCE);
    let acc: &mut Balance<Asset> = &mut balance_manager.balances[key];
    assert!(acc.value() >= amount, E_INSUFFICIENT_BALANCE);
    if (amount == acc.value()) {
        balance_manager.balances.remove<BalanceKey, Balance<Asset>>(key).into_coin(ctx)
    } else {
        acc.split(amount).into_coin(ctx)
    }
}
