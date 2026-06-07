// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// One-time witness + lxPLP LP share coin (display symbol `lxPLP`).
module leverx::lxplp;

use sui::{coin::TreasuryCap, coin_registry, transfer};

/// OTW for `coin_registry::new_currency_with_otw` (module name must match in ALL_CAPS).
public struct LXPLP has drop {}

fun init(otw: LXPLP, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        otw,
        9,
        b"lxPLP".to_string(),
        b"LeverX LP Share".to_string(),
        b"LeverX vault LP token".to_string(),
        b"".to_string(),
        ctx,
    );
    let metadata_cap = coin_registry::finalize(initializer, ctx);
    transfer::public_transfer(treasury_cap, ctx.sender());
    transfer::public_transfer(metadata_cap, ctx.sender());
}
