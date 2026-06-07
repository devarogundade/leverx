// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// Thin wrappers over DeepBook pool flash loans for keeper PTB composition.
/// Keeps liquidation and repayment paths composable without importing pool internals.
module leverx::deepbook_flash;

use deepbook::pool::{Self, Pool, FlashLoan};
use sui::coin::Coin;

/// Borrow quote from a DeepBook pool; must be repaid in the same PTB via `return_flash_loan_quote`.
public fun borrow_flash_loan_quote<BaseAsset, QuoteAsset>(
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    borrow_amount: u64,
    ctx: &mut TxContext,
): (Coin<QuoteAsset>, FlashLoan) {
    pool.borrow_flashloan_quote(borrow_amount, ctx)
}

/// Repay a quote flash loan — coin value must cover principal plus pool fee.
public fun return_flash_loan_quote<BaseAsset, QuoteAsset>(
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    coin: Coin<QuoteAsset>,
    flash_loan: FlashLoan,
) {
    pool.return_flashloan_quote(coin, flash_loan);
}
