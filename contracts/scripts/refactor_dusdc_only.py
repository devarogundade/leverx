#!/usr/bin/env python3
"""One-shot refactor: strip multi-collateral / spot / pyth from trade.move and events.move."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "sources"


def strip_user_proxy_collateral():
    path = SOURCES / "user_proxy.move"
    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r"\n/// Seize all collateral of.*?proxy\.balance_manager\.withdraw_with_cap\(&proxy\.withdraw_cap, amount, ctx\)\n    \}\n\}\n",
        "\n",
        text,
        flags=re.S,
    )
    path.write_text(text, encoding="utf-8")
    print("user_proxy: removed seize_range_collateral")


def refactor_trade():
    path = SOURCES / "trade.move"
    text = path.read_text(encoding="utf-8")

    # Header / imports
    text = text.replace(
        "/// Composes `UserProxy`, `LeverageVault`, DeepBook Predict, and spot swap into user-callable\n"
        "/// transaction functions: proxy factory, per-market-key collateral, swaps, leveraged mint/redeem,",
        "/// Composes `UserProxy`, `LeverageVault`, and DeepBook Predict into user-callable\n"
        "/// transaction functions: proxy factory, quote margin, leveraged mint/redeem,",
    )
    text = text.replace("use deepbook::{pool::Pool, registry::Registry};", "use deepbook::registry::Registry;")
    text = re.sub(r"\n    spot_swap,\n", "\n", text)
    text = re.sub(r"use pyth::price_info::PriceInfoObject;\n", "", text)
    text = re.sub(r"use std::u128;\n", "", text)
    text = re.sub(r"use token::deep::DEEP;\n", "", text)

    # Remove collateral deposit block through swap section, keep deposit_quote
    text = re.sub(
        r"// === Collateral \(per market key.*?\n\}\n\n/// Deposit quote margin into a binary",
        "/// Deposit quote margin into a binary",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"/// Withdraw collateral from a binary market key.*?/// Swap key collateral to quote via DeepBook spot.*?/// Market mint at current oracle ask",
        "/// Market mint at current oracle ask",
        text,
        flags=re.S,
    )

    # Generics: <Collateral, Quote> -> <Quote>
    text = text.replace("<Collateral, Quote>", "<Quote>")

    # Remove oracle args from signatures and call sites
    text = re.sub(r",\n    collateral_oracle: &PriceInfoObject,\n    quote_oracle: &PriceInfoObject,", "", text)
    text = re.sub(r"\n        collateral_oracle,\n        quote_oracle,", "", text)

    # Limit order / cancel: <Collateral> -> remove type param
    text = re.sub(r"public fun (place|cancel)_(binary|range)_limit_mint_order<Collateral>", r"public fun \1_\2_limit_mint_order", text)
    text = re.sub(r"public fun cancel_(binary|range)_limit_mint_order<Collateral>", r"public fun cancel_\1_limit_mint_order", text)

    # Remove collateral_asset from event calls
    text = re.sub(
        r"        std::type_name::with_defining_ids<Collateral>\(\),\n",
        "",
        text,
    )

    # Health / liquidatable functions
    health_binary = '''/// True when the binary market key is below the margin-call threshold.
public fun is_binary_position_liquidatable<Quote>(
    _registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
): bool {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    ltv::is_liquidatable(proxy.binary_quote_balance(key), debt)
}

/// True when the range market key is below the margin-call threshold.
public fun is_range_position_liquidatable<Quote>(
    _registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
): bool {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    ltv::is_liquidatable(proxy.range_quote_balance(key), debt)
}

/// Current quote health for a binary market key, in basis points.
public fun evaluate_binary_position_health<Quote>(
    _registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: MarketKey,
    clock: &Clock,
): u64 {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.binary_borrowed_quote(key));
    ltv::evaluate_account_health(proxy.binary_quote_balance(key), debt)
}

/// Current quote health for a range market key, in basis points.
public fun evaluate_range_position_health<Quote>(
    _registry: &LeverxRegistry,
    vault: &mut LeverageVault<Quote>,
    proxy: &UserProxy,
    key: RangeKey,
    clock: &Clock,
): u64 {
    vault_mod::accrue_interest(vault, clock);
    let debt = vault_mod::debt_with_accrued_interest(vault, proxy.range_borrowed_quote(key));
    ltv::evaluate_account_health(proxy.range_quote_balance(key), debt)
}'''

    text = re.sub(
        r"/// True when the binary market key's LTV.*?ltv::evaluate_account_health\(proxy\.range_quote_balance\(key\), debt\)\n\}",
        health_binary.rstrip() + "\n}",
        text,
        flags=re.S,
    )
    # fallback if pattern didn't match full block
    text = re.sub(
        r"/// True when the binary market key's LTV.*?/// Current collateral health for a range market key.*?\n\}\n",
        health_binary + "\n",
        text,
        flags=re.S,
    )

    # quote_borrow helpers
    borrow_fn = '''fun quote_borrow_for_leverage_binary(
    _registry: &LeverxRegistry,
    _proxy: &UserProxy,
    _key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
): u64 {
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_leverage_bps(leverage_bps);
    0
}

fun quote_borrow_for_leverage_range(
    _registry: &LeverxRegistry,
    _proxy: &UserProxy,
    _key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
): u64 {
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_leverage_bps(leverage_bps);
    0
}'''

    text = re.sub(
        r"fun quote_borrow_for_leverage_binary<Quote>\(.*?\n    borrow_quote\n\}\n\nfun quote_borrow_for_leverage_range<Quote>\(.*?\n    borrow_quote\n\}",
        borrow_fn,
        text,
        flags=re.S,
    )

    # plan_leverage
    plan_binary = '''fun plan_leverage_binary<Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: MarketKey,
    margin_quote: u64,
    leverage_bps: u64,
    require_auth: bool,
    ctx: &TxContext,
): (u64, u64) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    if (require_auth) {
        proxy.assert_can_act(ctx);
    };
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_leverage_bps(leverage_bps);
    assert!(
        proxy.binary_quote_balance(key) >= margin_quote,
        errors::insufficient_collateral(),
    );
    (0, 0)
}'''

    plan_range = '''fun plan_leverage_range<Quote>(
    registry: &LeverxRegistry,
    proxy: &mut UserProxy,
    manager: &PredictManager,
    key: RangeKey,
    margin_quote: u64,
    leverage_bps: u64,
    require_auth: bool,
    ctx: &TxContext,
): (u64, u64) {
    assert!(!registry.trading_paused(), errors::trading_paused());
    if (require_auth) {
        proxy.assert_can_act(ctx);
    };
    assert!(object::id(manager) == proxy.predict_manager_id(), errors::invalid_manager());
    assert!(margin_quote > 0, errors::zero_amount());
    ltv::assert_leverage_bps(leverage_bps);
    assert!(
        proxy.range_quote_balance(key) >= margin_quote,
        errors::insufficient_collateral(),
    );
    (0, 0)
}'''

    text = re.sub(
        r"fun plan_leverage_binary<Quote>\(.*?\(0, borrow_quote\)\n\}\n\nfun plan_leverage_range<Quote>\(.*?\(0, borrow_quote\)\n\}",
        plan_binary + "\n\n" + plan_range,
        text,
        flags=re.S,
    )

    # emit_open: remove Collateral generic
    text = text.replace("fun emit_open_binary<Collateral>(", "fun emit_open_binary(")
    text = text.replace("fun emit_open_range<Collateral>(", "fun emit_open_range(")

    # quote_leveraged_mint - simplify signatures if still have Collateral
    text = text.replace("quote_leveraged_mint_binary<Quote>", "quote_leveraged_mint_binary<Quote>")
    text = re.sub(
        r"public fun quote_leveraged_mint_binary<Quote>\(\n    registry: &LeverxRegistry,\n    proxy: &UserProxy,\n    key: MarketKey,\n    margin_quote: u64,\n    leverage_bps: u64,\n    clock: &Clock,\n\): u64 \{\n    quote_borrow_for_leverage_binary<Quote>\(",
        "public fun quote_leveraged_mint_binary<Quote>(\n    registry: &LeverxRegistry,\n    proxy: &UserProxy,\n    key: MarketKey,\n    margin_quote: u64,\n    leverage_bps: u64,\n): u64 {\n    quote_borrow_for_leverage_binary(",
        text,
    )

    path.write_text(text, encoding="utf-8")
    print("trade.move refactored")


def refactor_events():
    path = SOURCES / "events.move"
    text = path.read_text(encoding="utf-8")

    # Remove collateral event structs
    for struct in ("CollateralDeposited", "CollateralWithdrawn", "CollateralSwapped"):
        text = re.sub(
            rf"/// Emitted when collateral.*?\npublic struct {struct} has copy, drop \{{.*?\}}\n\n",
            "",
            text,
            flags=re.S,
        )

    # Remove collateral_asset fields from structs
    text = re.sub(r"\n    /// Collateral coin type.*?\n    collateral_asset: TypeName,\n", "\n", text)
    text = re.sub(r"\n    /// Seized collateral coin type\.\n    collateral_asset: TypeName,\n", "\n", text)
    text = re.sub(
        r"\n    /// Collateral atoms seized from the market key\.\n    collateral_seized: u64,\n"
        r"\n    /// Quote atoms received from collateral swap \(if any\)\.\n    quote_from_swap: u64,\n",
        "\n",
        text,
    )

    # Remove emit functions for collateral
    for fn in (
        "emit_collateral_whitelisted",
        "emit_collateral_deposited",
        "emit_collateral_withdrawn",
        "emit_collateral_swapped",
    ):
        text = re.sub(
            rf"/// Emit.*?\npublic\(package\) fun {fn}\(.*?\n\}}\n\n",
            "",
            text,
            flags=re.S,
        )

    # Fix emit_leveraged_position_opened - remove collateral_asset param
    text = re.sub(
        r"(public\(package\) fun emit_leveraged_position_opened\([^)]*?is_range: bool,\n)\s*collateral_asset: TypeName,\n",
        r"\1",
        text,
    )
    text = re.sub(
        r"(event::emit\(LeveragedPositionOpened \{[^}]*?is_range,\n)\s*collateral_asset,\n",
        r"\1",
        text,
    )

    # Similar for limit order and liquidation emits - strip collateral_asset from signatures and struct init
    text = re.sub(
        r",\n    collateral_asset: TypeName,",
        "",
        text,
    )
    text = re.sub(r"\n        collateral_asset,\n", "\n", text)

  # PositionLiquidated emit - remove collateral_seized, quote_from_swap from signature if present
    text = re.sub(
        r",\n    collateral_seized: u64,\n    quote_from_swap: u64,",
        "",
        text,
    )
    text = re.sub(
        r"\n        collateral_seized,\n        quote_from_swap,\n",
        "\n",
        text,
    )

    path.write_text(text, encoding="utf-8")
    print("events.move refactored")


if __name__ == "__main__":
    strip_user_proxy_collateral()
    refactor_trade()
    refactor_events()
