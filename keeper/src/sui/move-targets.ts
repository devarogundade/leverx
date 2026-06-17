import type { KeeperConfig } from '../config/keeper.config';

/**
 * Fully-qualified Move call targets the keeper is allowed to execute under Enoki
 * gas sponsorship. Restricting `allowedMoveCallTargets` ensures a leaked/abused
 * sponsorship key can only drive LeverX + DeepBook Predict calls the keeper
 * legitimately makes — never arbitrary transfers or unrelated packages.
 *
 * Derived from `cfg.packageId` (LeverX) and `cfg.predictPackageId` (market keys).
 */
export function keeperAllowedMoveCallTargets(cfg: KeeperConfig): string[] {
  const pkg = cfg.packageId;
  const predict = cfg.predictPackageId;
  const targets: string[] = [];

  if (pkg) {
    const leverx = [
      // predict_client — keeper owns the PredictManager (ctx.sender == owner).
      'predict_client::create_manager',
      'predict_client::deposit_quote',
      'predict_client::withdraw_quote',
      // trade — keeper relays user intents (registered executor) or runs maintenance.
      'trade::deposit_quote',
      'trade::leveraged_mint_binary_market',
      'trade::leveraged_mint_range_market',
      'trade::leveraged_mint_binary_limit',
      'trade::leveraged_mint_range_limit',
      'trade::leveraged_redeem_binary_market',
      'trade::leveraged_redeem_range_market',
      'trade::leveraged_redeem_binary_limit',
      'trade::leveraged_redeem_range_limit',
      'trade::execute_binary_limit_mint_order',
      'trade::execute_range_limit_mint_order',
      'trade::expire_binary_limit_mint_order',
      'trade::expire_range_limit_mint_order',
      'trade::settle_expired_proxy_position_permissionless',
      'trade::settle_expired_proxy_range_permissionless',
      'trade::recover_manager_surplus_to_trading_binary',
      'trade::recover_manager_surplus_to_trading_range',
      'trade::force_deleverage_binary_at_expiry',
      'trade::force_deleverage_range_at_expiry',
      'trade::force_repay_binary_post_expiry',
      'trade::force_repay_range_post_expiry',
      'trade::write_off_flat_binary_borrow_permissionless',
      'trade::write_off_flat_range_borrow_permissionless',
      // vault_flash + liquidation — permissionless liquidation flow.
      'vault_flash::borrow_flash_liquidity',
      'vault_flash::repay_flash_liquidity',
      'liquidation::flash_liquidate_with_redeem_permissionless',
      'liquidation::flash_liquidate_range_with_redeem_permissionless',
    ];
    for (const t of leverx) targets.push(`${pkg}::${t}`);
  }

  if (predict) {
    // Market-key constructors appended to every position PTB.
    for (const t of ['range_key::new', 'market_key::up', 'market_key::down']) {
      targets.push(`${predict}::${t}`);
    }
  }

  return targets;
}
