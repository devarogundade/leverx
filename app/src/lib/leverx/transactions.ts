import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";
import { splitCoinAmount } from "@/lib/leverx/coins";
import {
  DEFAULT_PLACEMENT_SLIPPAGE_BPS,
  DEFAULT_SLIPPAGE_BPS,
  SUI_CLOCK_OBJECT_ID,
  TRADE_GAS_BUDGET,
} from "@/lib/leverx/constants";
import { addMarketKey, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import { ensureLeverxAccount } from "@/lib/leverx/onboarding";
import {
  appendCancelLimit,
  appendClearTriggers,
  appendDepositQuote,
  appendLeveragedMint,
  appendLinkManager,
  appendRedeem,
  appendRegisterExecutor,
  appendDeleverageDebt,
  appendRevokeExecutor,
  appendSettleExpired,
  appendWithdrawQuote,
  type MintOrderParams,
} from "@/lib/leverx/ptb-builder";
import { lxplpCoinType, type LeverxProtocolConfig } from "@/lib/leverx/protocol";
import { fetchMintQuote, fetchRedeemQuote } from "@/lib/leverx/quotes";
import {
  applySlippageBps,
  applySlippageFloor,
  centsToPremiumRaw,
  leverageToBps,
  marginUsdToQuoteAtoms,
  positionQuoteAtoms,
} from "@/lib/leverx/trade-math";
import type { LimitMintOrder, LeveragedPosition } from "@/lib/leverx/indexer-client";
import { assertLeverxTradeCompatibility } from "@/lib/leverx/package-resolution";
import { executeWalletTransaction } from "@/lib/sui/execute-transaction";

export type LimitExecutionMode = "resting" | "immediate";

export type OpenTradeInput = {
  key: MarketKeyArgs;
  marginUsd: number;
  leverage: number;
  orderType: "market" | "limit";
  limitExecution?: LimitExecutionMode;
  limitCents?: number;
  quantity: bigint;
  marketSlippageBps?: number;
  placementSlippageBps?: number;
  orderExpiresMs?: number;
  /** When true, keeper force-deleverage may remint a 1x position from free quote. */
  remintAfterDeleverage?: boolean;
  tpPremium?: bigint;
  slPremium?: bigint;
};

export type ClosePositionInput = {
  position: LeveragedPosition;
  redeemMode?: "market" | "limit";
  minPayout?: bigint;
  minPremiumPerUnit?: bigint;
  marketSlippageBps?: number;
};

export type WithdrawQuoteInput = {
  accountId: string;
  key: MarketKeyArgs;
  amountAtoms: bigint;
};

function positionToKey(position: LeveragedPosition): MarketKeyArgs {
  return {
    oracleId: position.oracle_id,
    expiryMs: position.expiry_ms,
    strike: position.strike,
    higherStrike: position.higher_strike,
    isUp: position.is_up,
    isRange: position.is_range,
  };
}

function orderToKey(order: LimitMintOrder): MarketKeyArgs {
  return {
    oracleId: order.oracle_id,
    expiryMs: order.expiry_ms,
    strike: order.strike,
    higherStrike: order.higher_strike,
    isUp: order.is_up,
    isRange: order.is_range,
  };
}

function resolveMintOrderKind(input: OpenTradeInput): "market" | "limit" | "place" {
  if (input.orderType === "market") return "market";
  return input.limitExecution === "resting" ? "place" : "limit";
}

export async function executeOpenTrade(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  input: OpenTradeInput;
}): Promise<{ digest: string }> {
  const { input, cfg, client, wallet, account } = params;

  const leverxAccount = await ensureLeverxAccount({
    client,
    wallet,
    account,
    cfg,
  });

  if (!leverxAccount.predictManagerId) {
    throw new Error("Predict manager is not linked to your trading account.");
  }

  const marginAtoms = marginUsdToQuoteAtoms(input.marginUsd);
  const leverageBps = leverageToBps(input.leverage);
  let quantity = input.quantity > 0n ? input.quantity : 1n;
  const positionAtoms = positionQuoteAtoms(marginAtoms, leverageBps);
  const orderKind = resolveMintOrderKind(input);
  const limitPremiumRaw =
    input.limitCents != null && input.limitCents > 0
      ? centsToPremiumRaw(input.limitCents)
      : undefined;

  const fresh = await fetchMintQuote({
    client,
    cfg,
    accountId: leverxAccount.accountId,
    key: input.key,
    marginQuoteAtoms: marginAtoms,
    leverageBps,
    referencePremiumOverride:
      orderKind === "place" && limitPremiumRaw ? limitPremiumRaw : undefined,
  });
  if (!fresh) {
    throw new Error(
      orderKind === "place"
        ? "Could not size the order at your limit price. Lower the limit or reduce margin/leverage."
        : "Could not refresh the live contract price. The market may have moved — adjust margin or try again.",
    );
  }
  quantity = fresh.tradeQuantity;

  const marketSlippageBps = input.marketSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const placementSlippageBps = input.placementSlippageBps ?? DEFAULT_PLACEMENT_SLIPPAGE_BPS;

  const mintParams: MintOrderParams = {
    key: input.key,
    marginQuoteAtoms: marginAtoms,
    leverageBps,
    quantity,
    limitPremiumPerUnit: limitPremiumRaw,
    placementSlippageBps,
    marketSlippageBps: marketSlippageBps,
    maxMintCost: applySlippageBps(positionAtoms, marketSlippageBps),
    orderExpiresMs: input.orderExpiresMs ?? input.key.expiryMs,
    remintAfterDeleverage: input.remintAfterDeleverage ?? true,
  };

  await assertLeverxTradeCompatibility({
    client,
    leverxPackageId: cfg.packageId,
    predictId: cfg.predictId,
    oracleId: input.key.oracleId,
    predictManagerId: leverxAccount.predictManagerId!,
  });

  return executeWalletTransaction(
    client,
    wallet,
    account,
    async (tx) => {
      const quoteCoin = await splitCoinAmount(
        client,
        account.address,
        cfg.quoteType,
        marginAtoms,
        tx,
      );
      appendDepositQuote(tx, cfg, leverxAccount.accountId, input.key, quoteCoin);

      appendLeveragedMint(
        tx,
        cfg,
        leverxAccount.accountId,
        leverxAccount.predictManagerId!,
        mintParams,
        orderKind,
      );

      if (input.tpPremium || input.slPremium) {
        const marketKey = addMarketKey(tx, input.key, cfg.predictPackageId);
        tx.moveCall({
          target: `${cfg.packageId}::triggers::${
            input.key.isRange ? "set_range_triggers" : "set_automated_triggers_entry"
          }`,
          arguments: [
            tx.object(leverxAccount.accountId),
            marketKey,
            tx.pure.u64(input.tpPremium ?? 0n),
            tx.pure.u64(input.slPremium ?? 0n),
          ],
        });
      }
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeClosePosition(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  input: ClosePositionInput;
}): Promise<{ digest: string }> {
  const { position } = params.input;
  if (!position.predict_manager_id) {
    throw new Error("Position is missing a linked Predict manager.");
  }
  const predictManagerId = position.predict_manager_id;
  const redeemMode = params.input.redeemMode ?? "market";
  let minPayout = params.input.minPayout;

  if (redeemMode === "market" && minPayout == null) {
    const quote = await fetchRedeemQuote({
      client: params.client,
      cfg: params.cfg,
      key: positionToKey(position),
      quantity: BigInt(position.open_quantity),
    });
    const slippageBps = params.input.marketSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
    minPayout = quote ? applySlippageFloor(quote.expectedPayout, slippageBps) : 0n;
  }

  const key = positionToKey(position);

  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendRedeem(tx, params.cfg, {
        key,
        accountId: position.account_id,
        predictManagerId,
        quantity: BigInt(position.open_quantity),
        redeemMode,
        minPayout: minPayout ?? 0n,
        minPremiumPerUnit: params.input.minPremiumPerUnit,
      });
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeWithdrawQuote(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  input: WithdrawQuoteInput;
}): Promise<{ digest: string }> {
  if (params.input.amountAtoms <= 0n) {
    throw new Error("Withdraw amount must be greater than zero.");
  }

  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendWithdrawQuote(
        tx,
        params.cfg,
        params.input.accountId,
        params.input.key,
        params.input.amountAtoms,
      );
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeSettleExpired(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  position: LeveragedPosition;
}): Promise<{ digest: string }> {
  if (!params.position.predict_manager_id) {
    throw new Error("Position is missing a linked Predict manager.");
  }
  const predictManagerId = params.position.predict_manager_id;

  const key = positionToKey(params.position);

  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendSettleExpired(tx, params.cfg, {
        key,
        accountId: params.position.account_id,
        predictManagerId,
        quantity: BigInt(params.position.open_quantity),
      });
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeRepayDebt(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  position: LeveragedPosition;
  amountAtoms: bigint;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    async (tx) => {
      const repaymentCoin = await splitCoinAmount(
        params.client,
        params.account.address,
        params.cfg.quoteType,
        params.amountAtoms,
        tx,
      );
      appendDeleverageDebt(tx, params.cfg, {
        key: positionToKey(params.position),
        accountId: params.position.account_id,
        repaymentCoin,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      });
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeClearTriggers(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  accountId: string;
  key: MarketKeyArgs;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendClearTriggers(tx, params.cfg, params.accountId, params.key);
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeRegisterExecutor(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  accountId: string;
  executor: string;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendRegisterExecutor(tx, params.cfg, params.accountId, params.executor);
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeRevokeExecutor(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  accountId: string;
  executor: string;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendRevokeExecutor(tx, params.cfg, params.accountId, params.executor);
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeLinkManager(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  accountId: string;
  managerId: string;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendLinkManager(tx, params.cfg, params.accountId, params.managerId);
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeCancelLimitOrder(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  order: LimitMintOrder;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      appendCancelLimit(tx, params.cfg, {
        key: orderToKey(params.order),
        accountId: params.order.account_id,
      });
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeVaultSupply(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  amountAtoms: bigint;
}): Promise<{ digest: string }> {
  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    async (tx) => {
      const quoteCoin = await splitCoinAmount(
        params.client,
        params.account.address,
        params.cfg.quoteType,
        params.amountAtoms,
        tx,
      );
      const [lxplpCoin] = tx.moveCall({
        target: `${params.cfg.packageId}::leverage_vault::deposit_liquidity`,
        typeArguments: [params.cfg.quoteType],
        arguments: [tx.object(params.cfg.vaultId), quoteCoin, tx.object(SUI_CLOCK_OBJECT_ID)],
      });
      tx.transferObjects([lxplpCoin!], params.account.address);
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}

export async function executeVaultWithdraw(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
  lpAmountAtoms: bigint;
}): Promise<{ digest: string }> {
  const lxplpType = lxplpCoinType(params.cfg.packageId);

  return executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    async (tx) => {
      const lpCoin = await splitCoinAmount(
        params.client,
        params.account.address,
        lxplpType,
        params.lpAmountAtoms,
        tx,
      );
      const [quoteCoin] = tx.moveCall({
        target: `${params.cfg.packageId}::leverage_vault::withdraw_liquidity`,
        typeArguments: [params.cfg.quoteType],
        arguments: [tx.object(params.cfg.vaultId), lpCoin, tx.object(SUI_CLOCK_OBJECT_ID)],
      });
      tx.transferObjects([quoteCoin!], params.account.address);
    },
    { gasBudget: TRADE_GAS_BUDGET },
  );
}
