import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@/lib/leverx/constants";
import { addMarketKey, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import type { LeverxProtocolConfig } from "@/lib/leverx/protocol";
import type { TransactionObjectArgument } from "@mysten/sui/transactions";

export type MintOrderParams = {
  key: MarketKeyArgs;
  marginQuoteAtoms: bigint;
  leverageBps: bigint;
  quantity: bigint;
  limitPremiumPerUnit?: bigint;
  placementSlippageBps?: number;
  maxMintCost?: bigint;
  orderExpiresMs?: number;
};

export type RedeemParams = {
  key: MarketKeyArgs;
  accountId: string;
  predictManagerId: string;
  quantity: bigint;
  redeemMode?: "market" | "limit";
  minPayout?: bigint;
  minPremiumPerUnit?: bigint;
};

export type TriggerParams = {
  key: MarketKeyArgs;
  accountId: string;
  takeProfitPremium: bigint;
  stopLossPremium: bigint;
};

export type VaultSupplyParams = {
  quoteCoin: TransactionObjectArgument;
};

export type VaultWithdrawParams = {
  lpCoin: TransactionObjectArgument;
};

function mintFn(orderType: "market" | "limit" | "place", isRange: boolean): string {
  if (orderType === "place") {
    return isRange ? "place_range_limit_mint_order" : "place_binary_limit_mint_order";
  }
  if (orderType === "limit") {
    return isRange ? "leveraged_mint_range_limit" : "leveraged_mint_binary_limit";
  }
  return isRange ? "leveraged_mint_range_market" : "leveraged_mint_binary_market";
}

function redeemFn(isRange: boolean, limit: boolean): string {
  if (limit) {
    return isRange ? "leveraged_redeem_range_limit" : "leveraged_redeem_binary_limit";
  }
  return isRange ? "leveraged_redeem_range_market" : "leveraged_redeem_binary_market";
}

function cancelFn(isRange: boolean): string {
  return isRange ? "cancel_range_limit_mint_order" : "cancel_binary_limit_mint_order";
}

function depositQuoteFn(isRange: boolean): string {
  return isRange ? "deposit_quote_for_range_market" : "deposit_quote_for_binary_market";
}

function withdrawQuoteFn(isRange: boolean): string {
  return isRange ? "withdraw_quote_for_range_market" : "withdraw_quote_for_binary_market";
}

export function buildDepositQuote(
  cfg: LeverxProtocolConfig,
  accountId: string,
  key: MarketKeyArgs,
  quoteCoin: TransactionObjectArgument,
): Transaction {
  const tx = new Transaction();
  const marketKey = addMarketKey(tx, key);

  tx.moveCall({
    target: `${cfg.packageId}::trade::${depositQuoteFn(key.isRange)}`,
    typeArguments: [cfg.quoteType],
    arguments: [tx.object(accountId), marketKey, quoteCoin],
  });

  return tx;
}

export function appendDepositQuote(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  accountId: string,
  key: MarketKeyArgs,
  quoteCoin: TransactionObjectArgument,
): void {
  const marketKey = addMarketKey(tx, key);
  tx.moveCall({
    target: `${cfg.packageId}::trade::${depositQuoteFn(key.isRange)}`,
    typeArguments: [cfg.quoteType],
    arguments: [tx.object(accountId), marketKey, quoteCoin],
  });
}

export function appendWithdrawQuote(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  accountId: string,
  key: MarketKeyArgs,
  amountAtoms: bigint,
): void {
  const marketKey = addMarketKey(tx, key);
  tx.moveCall({
    target: `${cfg.packageId}::trade::${withdrawQuoteFn(key.isRange)}`,
    typeArguments: [cfg.quoteType],
    arguments: [tx.object(accountId), marketKey, tx.pure.u64(amountAtoms)],
  });
}

export function appendLeveragedMint(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  accountId: string,
  predictManagerId: string,
  params: MintOrderParams,
  orderType: "market" | "limit" | "place",
): void {
  const marketKey = addMarketKey(tx, params.key);
  const fn = mintFn(orderType, params.key.isRange);

  if (orderType === "place") {
    tx.moveCall({
      target: `${cfg.packageId}::trade::${fn}`,
      typeArguments: [cfg.quoteType],
      arguments: [
        tx.object(cfg.registryId),
        tx.object(accountId),
        tx.object(cfg.predictId),
        tx.object(params.key.oracleId),
        marketKey,
        tx.pure.u64(params.limitPremiumPerUnit ?? 0n),
        tx.pure.u64(params.placementSlippageBps ?? 500),
        tx.pure.u64(params.marginQuoteAtoms),
        tx.pure.u64(params.leverageBps),
        tx.pure.u64(params.quantity),
        tx.pure.u64(params.orderExpiresMs ?? params.key.expiryMs),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return;
  }

  const args = [
    tx.object(cfg.registryId),
    tx.object(cfg.vaultId),
    tx.object(accountId),
    tx.object(cfg.predictId),
    tx.object(predictManagerId),
    tx.object(params.key.oracleId),
    marketKey,
    tx.pure.u64(params.marginQuoteAtoms),
    tx.pure.u64(params.leverageBps),
    tx.pure.u64(params.quantity),
  ];

  if (orderType === "limit") {
    args.push(
      tx.pure.u64(params.limitPremiumPerUnit ?? 0n),
      tx.pure.u64(params.placementSlippageBps ?? 500),
    );
  } else {
    args.push(tx.pure.u64(params.maxMintCost ?? 0n));
  }

  args.push(tx.object(SUI_CLOCK_OBJECT_ID));

  tx.moveCall({
    target: `${cfg.packageId}::trade::${fn}`,
    typeArguments: [cfg.quoteType],
    arguments: args,
  });
}

export function buildLeveragedMintTx(
  cfg: LeverxProtocolConfig,
  accountId: string,
  predictManagerId: string,
  params: MintOrderParams,
  orderType: "market" | "limit" | "place",
  deposits?: {
    quoteCoin?: TransactionObjectArgument;
  },
): Transaction {
  const tx = new Transaction();

  if (deposits?.quoteCoin) {
    appendDepositQuote(tx, cfg, accountId, params.key, deposits.quoteCoin);
  }

  appendLeveragedMint(tx, cfg, accountId, predictManagerId, params, orderType);
  return tx;
}

export function appendRedeem(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  params: RedeemParams,
): void {
  const marketKey = addMarketKey(tx, params.key);
  const limit = params.redeemMode === "limit";

  tx.moveCall({
    target: `${cfg.packageId}::trade::${redeemFn(params.key.isRange, limit)}`,
    typeArguments: [cfg.quoteType],
    arguments: [
      tx.object(cfg.registryId),
      tx.object(cfg.vaultId),
      tx.object(cfg.feeCollectorId),
      tx.object(params.accountId),
      tx.object(cfg.predictId),
      tx.object(params.predictManagerId),
      tx.object(params.key.oracleId),
      marketKey,
      tx.pure.u64(params.quantity),
      tx.pure.u64(limit ? (params.minPremiumPerUnit ?? 0n) : (params.minPayout ?? 0n)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
}

export function appendSettleExpired(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  params: RedeemParams,
): void {
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange ? "settle_expired_proxy_range" : "settle_expired_proxy_position";

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
      marketKey,
      tx.pure.u64(params.quantity),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
}

export function appendDeleverageDebt(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  params: {
    key: MarketKeyArgs;
    accountId: string;
    repaymentCoin: TransactionObjectArgument;
  },
): void {
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange
    ? "deleverage_range_account_balance"
    : "deleverage_binary_account_balance";

  tx.moveCall({
    target: `${cfg.packageId}::trade::${fn}`,
    typeArguments: [cfg.quoteType],
    arguments: [
      tx.object(cfg.registryId),
      tx.object(cfg.vaultId),
      tx.object(cfg.feeCollectorId),
      tx.object(params.accountId),
      marketKey,
      params.repaymentCoin,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
}

export function appendClearTriggers(
  tx: Transaction,
  _cfg: LeverxProtocolConfig,
  accountId: string,
  key: MarketKeyArgs,
): void {
  const marketKey = addMarketKey(tx, key);
  const fn = key.isRange ? "clear_range_triggers" : "clear_automated_triggers";

  tx.moveCall({
    target: `${_cfg.packageId}::triggers::${fn}`,
    arguments: [tx.object(accountId), marketKey],
  });
}

export function appendRegisterExecutor(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  accountId: string,
  executor: string,
): void {
  tx.moveCall({
    target: `${cfg.packageId}::trade::register_executor_entry`,
    arguments: [tx.object(accountId), tx.pure.address(executor)],
  });
}

export function appendRevokeExecutor(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  accountId: string,
  executor: string,
): void {
  tx.moveCall({
    target: `${cfg.packageId}::trade::revoke_executor_entry`,
    arguments: [tx.object(accountId), tx.pure.address(executor)],
  });
}

export function appendLinkManager(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  accountId: string,
  managerId: string,
): void {
  tx.moveCall({
    target: `${cfg.packageId}::trade::link_predict_manager_entry`,
    arguments: [tx.object(accountId), tx.pure.id(managerId)],
  });
}

export function appendCancelLimit(
  tx: Transaction,
  cfg: LeverxProtocolConfig,
  params: { key: MarketKeyArgs; accountId: string },
): void {
  const marketKey = addMarketKey(tx, params.key);
  tx.moveCall({
    target: `${cfg.packageId}::trade::${cancelFn(params.key.isRange)}`,
    arguments: [tx.object(params.accountId), marketKey],
  });
}

export function buildSetTriggersTx(cfg: LeverxProtocolConfig, params: TriggerParams): Transaction {
  const tx = new Transaction();
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange ? "set_range_triggers" : "set_automated_triggers_entry";

  tx.moveCall({
    target: `${cfg.packageId}::triggers::${fn}`,
    arguments: [
      tx.object(params.accountId),
      marketKey,
      tx.pure.u64(params.takeProfitPremium),
      tx.pure.u64(params.stopLossPremium),
    ],
  });

  return tx;
}

export function buildVaultSupplyTx(
  cfg: LeverxProtocolConfig,
  params: VaultSupplyParams,
  recipient: string,
): Transaction {
  const tx = new Transaction();

  const [lxplpCoin] = tx.moveCall({
    target: `${cfg.packageId}::leverage_vault::deposit_liquidity`,
    typeArguments: [cfg.quoteType],
    arguments: [tx.object(cfg.vaultId), params.quoteCoin, tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  tx.transferObjects([lxplpCoin!], recipient);
  return tx;
}

export function buildVaultWithdrawTx(
  cfg: LeverxProtocolConfig,
  params: VaultWithdrawParams,
  recipient: string,
): Transaction {
  const tx = new Transaction();

  const [quoteCoin] = tx.moveCall({
    target: `${cfg.packageId}::leverage_vault::withdraw_liquidity`,
    typeArguments: [cfg.quoteType],
    arguments: [tx.object(cfg.vaultId), params.lpCoin, tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  tx.transferObjects([quoteCoin!], recipient);
  return tx;
}

export function buildOnboardingTx(
  cfg: LeverxProtocolConfig,
  existingManagerId?: string | null,
): Transaction {
  const tx = new Transaction();

  let managerIdArg: TransactionObjectArgument | ReturnType<Transaction["pure"]["id"]>;

  if (existingManagerId) {
    managerIdArg = tx.pure.id(existingManagerId);
  } else {
    const [createdId] = tx.moveCall({
      target: `${cfg.packageId}::predict_client::create_manager`,
      arguments: [],
    });
    managerIdArg = createdId!;
  }

  tx.moveCall({
    target: `${cfg.packageId}::trade::create_user_proxy`,
    arguments: [managerIdArg],
  });

  return tx;
}

export function buildLinkManagerTx(
  cfg: LeverxProtocolConfig,
  accountId: string,
  managerId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${cfg.packageId}::trade::link_predict_manager_entry`,
    arguments: [tx.object(accountId), tx.pure.id(managerId)],
  });

  return tx;
}
