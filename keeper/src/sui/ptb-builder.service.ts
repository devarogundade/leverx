import { Injectable } from '@nestjs/common';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { CollateralRoute } from '../config/collateral-routing';
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
    if (args.isRange) {
      return tx.moveCall({
        target: `${cfg.predictPackageId}::range_key::new`,
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
      target: `${cfg.predictPackageId}::market_key::${fn}`,
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

  buildSettleBinary(
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::settle_expired_proxy_position`,
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

  buildSettleRange(
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));

    tx.moveCall({
      target: `${cfg.packageId}::trade::settle_expired_proxy_range`,
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

  buildExecuteLimitMint(
    cfg: KeeperConfig,
    order: LimitMintOrder,
    predictManagerId: string,
    route: CollateralRoute,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromLimitOrder(order));
    const fn = order.is_range
      ? 'execute_range_limit_mint_order'
      : 'execute_binary_limit_mint_order';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [route.coinType, cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(order.account_id),
        tx.object(cfg.predictId),
        tx.object(predictManagerId),
        tx.object(order.oracle_id),
        tx.object(route.pythOracleId),
        tx.object(cfg.pythQuoteOracleId),
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

  buildIsLiquidatable(
    cfg: KeeperConfig,
    position: LeveragedPosition,
    route: CollateralRoute,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));
    const fn = position.is_range
      ? 'is_range_position_liquidatable'
      : 'is_binary_position_liquidatable';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [route.coinType, cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(position.account_id),
        key,
        tx.object(route.pythOracleId),
        tx.object(cfg.pythQuoteOracleId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /**
   * Liquidate an underwater key. Quote-native collateral uses vault flash loans;
   * other assets use DeepBook flash + spot swap.
   */
  buildLiquidation(
    tx: Transaction,
    cfg: KeeperConfig,
    position: LeveragedPosition,
    route: CollateralRoute,
    borrowAmount: bigint,
    minQuoteOut: bigint,
    keeperAddress: string,
    feeDeep?: TransactionObjectArgument,
  ): Transaction {
    if (route.quoteNative) {
      this.buildQuoteNativeLiquidation(tx, cfg, position, route, borrowAmount);
      return tx;
    }
    if (!feeDeep) {
      throw new Error('feeDeep required for spot liquidation');
    }
    this.buildSpotLiquidation(
      tx,
      cfg,
      position,
      route,
      borrowAmount,
      minQuoteOut,
      keeperAddress,
      feeDeep,
    );
    return tx;
  }

  /** Vault flash loan + permissionless redeem/liquidate (dUSDC collateral). */
  private buildQuoteNativeLiquidation(
    tx: Transaction,
    cfg: KeeperConfig,
    position: LeveragedPosition,
    route: CollateralRoute,
    borrowAmount: bigint,
  ): void {
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

    const [quoteLeft, seized] = tx.moveCall({
      target: `${cfg.packageId}::liquidation::${liquidateTarget}`,
      typeArguments: [cfg.quoteType, route.coinType],
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
        tx.object(route.pythOracleId),
        tx.object(cfg.pythQuoteOracleId),
        flashCoin,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    tx.mergeCoins(quoteLeft, [seized]);
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
  }

  /** DeepBook flash loan + spot swap liquidation (SUI, DEEP, etc.). */
  private buildSpotLiquidation(
    tx: Transaction,
    cfg: KeeperConfig,
    position: LeveragedPosition,
    route: CollateralRoute,
    borrowAmount: bigint,
    minQuoteOut: bigint,
    keeperAddress: string,
    feeDeep: TransactionObjectArgument,
  ): void {
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));
    const spotPoolId = route.spotPoolId!;

    const [flashCoin, flashLoan] = tx.moveCall({
      target: `${cfg.packageId}::deepbook_flash::borrow_flash_loan_quote`,
      typeArguments: [route.coinType, cfg.quoteType],
      arguments: [tx.object(spotPoolId), tx.pure.u64(borrowAmount)],
    });

    const liquidateTarget = position.is_range
      ? 'flash_liquidate_range_with_spot_swap_and_redeem'
      : 'flash_liquidate_with_spot_swap_and_redeem';

    const [quoteLeft, deepLeft] = tx.moveCall({
      target: `${cfg.packageId}::liquidation::${liquidateTarget}`,
      typeArguments: [cfg.quoteType, route.coinType],
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
        tx.object(spotPoolId),
        tx.object(route.pythOracleId),
        tx.object(cfg.pythQuoteOracleId),
        flashCoin,
        feeDeep,
        tx.pure.u64(minQuoteOut),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    tx.moveCall({
      target: `${cfg.packageId}::deepbook_flash::return_flash_loan_quote`,
      typeArguments: [route.coinType, cfg.quoteType],
      arguments: [tx.object(spotPoolId), quoteLeft, flashLoan],
    });

    tx.transferObjects([deepLeft], keeperAddress);
  }
}
