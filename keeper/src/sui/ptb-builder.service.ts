import { Injectable } from '@nestjs/common';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { KeeperConfig } from '../config/keeper.config';
import type { LeveragedPosition, LimitMintOrder } from '../indexer/indexer.types';
import { SUI_CLOCK_OBJECT_ID, type PositionKeyArgs } from '../keeper/keeper.types';

@Injectable()
export class PtbBuilderService {
  addMarketKey(
    tx: Transaction,
    cfg: KeeperConfig,
    args: PositionKeyArgs,
  ): TransactionObjectArgument {
    const pkg = cfg.predictPackageId;
    if (args.isRange) {
      return tx.moveCall({
        target: `${pkg}::range_key::new`,
        arguments: [
          tx.pure.id(args.oracleId),
          tx.pure.u64(args.expiryMs),
          tx.pure.u64(args.strike),
          tx.pure.u64(args.higherStrike),
        ],
      })[0];
    }

    const fn = args.isUp ? 'up' : 'down';
    return tx.moveCall({
      target: `${pkg}::market_key::${fn}`,
      arguments: [
        tx.pure.id(args.oracleId),
        tx.pure.u64(args.expiryMs),
        tx.pure.u64(args.strike),
      ],
    })[0];
  }

  keyFromPosition(position: LeveragedPosition): PositionKeyArgs {
    return {
      oracleId: position.oracle_id,
      expiryMs: position.expiry_ms,
      strike: position.strike,
      higherStrike: position.higher_strike,
      isUp: position.is_up,
      isRange: position.is_range,
    };
  }

  keyFromLimitOrder(order: LimitMintOrder): PositionKeyArgs {
    return {
      oracleId: order.oracle_id,
      expiryMs: order.expiry_ms,
      strike: order.strike,
      higherStrike: order.higher_strike,
      isUp: order.is_up,
      isRange: order.is_range,
    };
  }

  buildSettleBinary(cfg: KeeperConfig, position: LeveragedPosition): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::settle_expired_proxy_position_permissionless`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildSettleRange(cfg: KeeperConfig, position: LeveragedPosition): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::settle_expired_proxy_range_permissionless`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildForceDeleverageBinary(
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::force_deleverage_binary_at_expiry`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildForceRepayBinaryPostExpiry(
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::force_repay_binary_post_expiry`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildForceRepayRangePostExpiry(
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::force_repay_range_post_expiry`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildForceDeleverageRange(
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::force_deleverage_range_at_expiry`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildExpireLimitMint(cfg: KeeperConfig, order: LimitMintOrder): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromLimitOrder(order));
    const fn = order.is_range
      ? 'expire_range_limit_mint_order'
      : 'expire_binary_limit_mint_order';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      arguments: [
        tx.object(order.account_id),
        key,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildExecuteLimitMint(
    cfg: KeeperConfig,
    order: LimitMintOrder,
    predictManagerId: string,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromLimitOrder(order));
    const fn = order.is_range
      ? 'execute_range_limit_mint_order'
      : 'execute_binary_limit_mint_order';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(order.account_id),
        tx.object(cfg.predictId),
        tx.object(predictManagerId),
        tx.object(order.oracle_id),
        key,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildTriggerRedeem(
    cfg: KeeperConfig,
    position: LeveragedPosition,
    minPayout: bigint,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));
    const fn = position.is_range
      ? 'leveraged_redeem_range_market'
      : 'leveraged_redeem_binary_market';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.pure.u64(minPayout),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildIsLiquidatable(cfg: KeeperConfig, position: LeveragedPosition): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));
    const fn = position.is_range
      ? 'is_range_position_liquidatable_with_open_position'
      : 'is_binary_position_liquidatable_with_open_position';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /** Read on-chain TP/SL premiums for a position's market key. */
  buildGetTriggers(cfg: KeeperConfig, position: LeveragedPosition): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));
    const fn = position.is_range ? 'get_range_triggers' : 'get_triggers';

    tx.moveCall({
      target: `${cfg.packageId}::triggers::${fn}`,
      arguments: [tx.object(position.account_id), key],
    });
    return tx;
  }

  /** Vault flash loan + permissionless redeem/liquidate (dUSDC quote-only). */
  buildLiquidation(
    tx: Transaction,
    cfg: KeeperConfig,
    position: LeveragedPosition,
    borrowAmount: bigint,
  ): Transaction {
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    const [flashCoin, receipt] = tx.moveCall({
      target: `${cfg.packageId}::vault_flash::borrow_flash_liquidity`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.pure.u64(borrowAmount),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    const liquidateTarget = position.is_range
      ? 'flash_liquidate_range_with_redeem_permissionless'
      : 'flash_liquidate_with_redeem_permissionless';

    const quoteLeft = tx.moveCall({
      target: `${cfg.packageId}::liquidation::${liquidateTarget}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(position.account_id),
        tx.object(cfg.predictId),
        tx.object(position.predict_manager_id!),
        tx.object(position.oracle_id),
        key,
        tx.pure.u64(position.open_quantity),
        flashCoin,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    })[0];

    tx.moveCall({
      target: `${cfg.packageId}::vault_flash::repay_flash_liquidity`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        quoteLeft,
        receipt,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    return tx;
  }
}
