// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Registry-checked vault flash loans for keeper liquidation PTBs.
module leverx::vault_flash;

use leverx::{
    fee_collector::{Self, FeeCollector},
    leverage_vault::{Self, LeverageVault, FlashReceipt},
    protocol_registry::{Self, LeverxRegistry},
};
use sui::{clock::Clock, coin::Coin};

/// Borrow quote from the protocol vault after verifying registry linkage.
public fun borrow_flash_liquidity<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<Quote>, FlashReceipt) {
    protocol_registry::assert_vault(registry, vault);
    leverage_vault::borrow_flash_liquidity(vault, amount, clock, ctx)
}

/// Repay a vault flash loan after verifying registry linkage.
public fun repay_flash_liquidity<Quote>(
    registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    collector: &mut FeeCollector<Quote>,
    payment: Coin<Quote>,
    receipt: FlashReceipt,
    liquidated_account_id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    protocol_registry::assert_vault(registry, vault);
    protocol_registry::assert_fee_collector(registry, collector);
    fee_collector::repay_flash_liquidity(vault, collector, payment, receipt, liquidated_account_id, clock, ctx);
}
