import { Injectable } from '@nestjs/common';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { KeeperConfig } from '../config/keeper.config';
import type { LeveragedPosition, LimitMintOrder } from '../indexer/indexer.types';
import { SUI_CLOCK_OBJECT_ID, type PositionKeyArgs } from '../keeper/keeper.types';

@Injectable()
export class PtbBuilderService {
  /** Keeper-owned Predict manager (ctx.sender becomes manager.owner). */
  buildCreatePredictManager(tx: Transaction, cfg: KeeperConfig): void {
    tx.moveCall({
      target: `${cfg.packageId}::predict_client::create_manager`,
      arguments: [],
    });
  }

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
        tx.pure.u64(BigInt(position.open_quantity || 0)),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /** Live per-contract ask from DeepBook Predict (via `predict_client`). */
  buildMarketAsk(
    cfg: KeeperConfig,
    keyArgs: PositionKeyArgs,
    quantity: bigint,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, keyArgs);
    const fn = keyArgs.isRange ? 'market_ask_range' : 'market_ask_binary';

    tx.moveCall({
      target: `${cfg.packageId}::predict_client::${fn}`,
      arguments: [
        tx.object(cfg.predictId),
        tx.object(keyArgs.oracleId),
        key,
        tx.pure.u64(quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /** Live per-contract bid from DeepBook Predict (via `predict_client`). */
  buildMarketBid(
    cfg: KeeperConfig,
    keyArgs: PositionKeyArgs,
    quantity: bigint,
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, keyArgs);
    const fn = keyArgs.isRange ? 'market_bid_range' : 'market_bid_binary';

    tx.moveCall({
      target: `${cfg.packageId}::predict_client::${fn}`,
      arguments: [
        tx.object(cfg.predictId),
        tx.object(keyArgs.oracleId),
        key,
        tx.pure.u64(quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /** Linked Predict manager on a user proxy (for keeper fills without indexer). */
  buildReadPredictManagerId(cfg: KeeperConfig, accountId: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${cfg.packageId}::user_proxy::predict_manager_id`,
      arguments: [tx.object(accountId)],
    });
    return tx;
  }

  /** Spendable trading-account quote (key-agnostic custody pool). */
  buildReadWithdrawableTradingQuote(cfg: KeeperConfig, accountId: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${cfg.packageId}::user_proxy::withdrawable_trading_quote`,
      arguments: [tx.object(accountId)],
    });
    return tx;
  }

  /** Registry admin settings — read via on-chain view functions. */
  buildReadRegistryU64(
    cfg: KeeperConfig,
    fn: 'liquidation_bps' | 'final_window_ms',
  ): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${cfg.packageId}::protocol_registry::${fn}`,
      arguments: [tx.object(cfg.registryId)],
    });
    return tx;
  }

  buildReadRegistryBool(cfg: KeeperConfig, fn: 'trading_paused'): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${cfg.packageId}::protocol_registry::${fn}`,
      arguments: [tx.object(cfg.registryId)],
    });
    return tx;
  }

  buildReadKeeperAddress(cfg: KeeperConfig): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${cfg.packageId}::protocol_registry::keeper_address`,
      arguments: [tx.object(cfg.registryId)],
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

    // `liquidated_account_id` — required since vault_flash repay routes surplus skim events.
    tx.moveCall({
      target: `${cfg.packageId}::vault_flash::repay_flash_liquidity`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        quoteLeft,
        receipt,
        tx.pure.id(position.account_id),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    return tx;
  }

  /** On-chain accrued debt + buffer for liquidation flash loans. */
  buildQuoteLiquidationFlashBorrow(
    cfg: KeeperConfig,
    position: LeveragedPosition,
    bufferBps: number,
  ): Transaction {
    const tx = new Transaction();
    const ledgerPrincipal =
      BigInt(position.borrow_quote || 0) > 0n
        ? BigInt(position.borrow_quote)
        : BigInt(position.margin_quote || 0);

    tx.moveCall({
      target: `${cfg.packageId}::trade::quote_liquidation_flash_borrow`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.pure.u64(ledgerPrincipal),
        tx.pure.u64(bufferBps),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /** Permissionless bad-debt write-off when contracts are flat and market ended. */
  buildWriteOffFlatBorrow(
    tx: Transaction,
    cfg: KeeperConfig,
    position: LeveragedPosition,
  ): Transaction {
    const key = this.addMarketKey(tx, cfg, this.keyFromPosition(position));
    const fn = position.is_range
      ? 'write_off_flat_range_borrow_permissionless'
      : 'write_off_flat_binary_borrow_permissionless';

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
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /**
   * User-initiated mint relay. The keeper is the proxy's secondary owner and the
   * keeper-owned manager owner, so it executes the open against quote the trader
   * already deposited onto the proxy key ledger. Supports both `market` and
   * immediate `limit` order kinds.
   */
  buildLeveragedMint(
    cfg: KeeperConfig,
    accountId: string,
    predictManagerId: string,
    params: {
      key: PositionKeyArgs;
      marginQuoteAtoms: bigint;
      leverageBps: bigint;
      quantity: bigint;
      maxMintCost: bigint;
      marketSlippageBps: number;
      remintAfterDeleverage: boolean;
      orderKind: 'market' | 'limit';
      limitPremiumPerUnit: bigint;
      placementSlippageBps: number;
    },
  ): Transaction {
    const tx = new Transaction();

    const key = this.addMarketKey(tx, cfg, params.key);
    const limit = params.orderKind === 'limit';
    const fn = params.key.isRange
      ? limit
        ? 'leveraged_mint_range_limit'
        : 'leveraged_mint_range_market'
      : limit
        ? 'leveraged_mint_binary_limit'
        : 'leveraged_mint_binary_market';

    const args = [
      tx.object(cfg.registryId),
      tx.object(cfg.vaultId),
      tx.object(accountId),
      tx.object(cfg.predictId),
      tx.object(predictManagerId),
      tx.object(params.key.oracleId),
      key,
      tx.pure.u64(params.marginQuoteAtoms),
      tx.pure.u64(params.leverageBps),
      tx.pure.u64(params.quantity),
    ];

    if (limit) {
      args.push(
        tx.pure.u64(params.limitPremiumPerUnit),
        tx.pure.u64(params.placementSlippageBps),
      );
    } else {
      args.push(
        tx.pure.u64(params.maxMintCost),
        tx.pure.u64(params.marketSlippageBps),
      );
    }

    args.push(
      tx.pure.bool(params.remintAfterDeleverage),
      tx.object(SUI_CLOCK_OBJECT_ID),
    );

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: args,
    });
    return tx;
  }

  /** User-initiated redeem relay (keeper acts as registered executor). */
  buildLeveragedRedeem(
    cfg: KeeperConfig,
    params: {
      key: PositionKeyArgs;
      accountId: string;
      predictManagerId: string;
      quantity: bigint;
      minPayout: bigint;
      redeemMode: 'market' | 'limit';
      minPremiumPerUnit: bigint;
    },
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, params.key);
    const limit = params.redeemMode === 'limit';
    const fn = params.key.isRange
      ? limit
        ? 'leveraged_redeem_range_limit'
        : 'leveraged_redeem_range_market'
      : limit
        ? 'leveraged_redeem_binary_limit'
        : 'leveraged_redeem_binary_market';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(params.accountId),
        tx.object(cfg.predictId),
        tx.object(params.predictManagerId),
        tx.object(params.key.oracleId),
        key,
        tx.pure.u64(params.quantity),
        tx.pure.u64(limit ? params.minPremiumPerUnit : params.minPayout),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  /** User-initiated settle of an expired position (keeper-gated permissionless variant). */
  buildSettleExpiredPermissionless(
    cfg: KeeperConfig,
    params: {
      key: PositionKeyArgs;
      accountId: string;
      predictManagerId: string;
      quantity: bigint;
    },
  ): Transaction {
    const tx = new Transaction();
    const key = this.addMarketKey(tx, cfg, params.key);
    const fn = params.key.isRange
      ? 'settle_expired_proxy_range_permissionless'
      : 'settle_expired_proxy_position_permissionless';

    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(cfg.vaultId),
        tx.object(cfg.feeCollectorId),
        tx.object(params.accountId),
        tx.object(cfg.predictId),
        tx.object(params.predictManagerId),
        tx.object(params.key.oracleId),
        key,
        tx.pure.u64(params.quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }
}
