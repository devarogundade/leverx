// Copyright (c) LeverX contributors
// SPDX-License-Identifier: Apache-2.0

/// One-shot protocol deployment: LeverageVault + FeeCollector + LeverxRegistry.
module leverx::deploy;

use leverx::{
    fee_collector::{Self, FeeCollector},
    leverage_vault::{Self, LeverageVault},
    protocol_registry::{Self, AdminCap, LeverxRegistry},
};

/// Create the quote vault, fee collector, and registry linked to a Predict shared object.
/// Returns unshared objects — caller must invoke `share` on each before use.
public fun deploy_protocol<Quote>(
    admin: &AdminCap,
    predict_id: ID,
    ctx: &mut TxContext,
): (LeverageVault<Quote>, FeeCollector<Quote>, LeverxRegistry) {
    let treasury_cap = leverage_vault::create_lvlp_treasury(ctx);
    let vault = leverage_vault::new(treasury_cap, ctx);
    let vault_id = object::id(&vault);
    let collector = fee_collector::new<Quote>(vault_id, ctx);
    let collector_id = object::id(&collector);
    let registry = protocol_registry::initialize(admin, predict_id, vault_id, collector_id, ctx);
    (vault, collector, registry)
}

/// Deploy, emit `ProtocolDeployed`, and share vault + fee collector + registry.
public entry fun deploy_and_share<Quote>(
    admin: &AdminCap,
    predict_id: ID,
    ctx: &mut TxContext,
) {
    let (vault, collector, registry) = deploy_protocol<Quote>(admin, predict_id, ctx);
    leverx::events::emit_protocol_deployed(
        object::id(&registry),
        object::id(&vault),
        object::id(&collector),
        predict_id,
        ctx.sender(),
    );
    leverage_vault::share(vault);
    fee_collector::share(collector);
    protocol_registry::share_registry(registry);
}
