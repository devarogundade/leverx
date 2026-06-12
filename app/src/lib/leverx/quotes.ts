import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { READONLY_SENDER } from "@/context/WalletContext";
import {
  PREDICT_QUOTE_REFERENCE_QUANTITY,
  SUI_CLOCK_OBJECT_ID,
} from "@/lib/leverx/constants";
import { addMarketKey, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import type { LeverxProtocolConfig } from "@/lib/leverx/protocol";
import {
  classifyPredictPremium,
  costFromPremiumPerUnit,
  estimateQuantity,
} from "@/lib/leverx/trade-math";

export type PredictQuoteConfig = Pick<LeverxProtocolConfig, "packageId" | "predictId">;

export type MintQuote = {
  marketAskPerUnit: bigint;
  mintCost: bigint;
  borrowQuote: bigint;
  /** Contracts implied by margin, leverage, and live ask. */
  tradeQuantity: bigint;
};

export type RedeemQuote = {
  marketBidPerUnit: bigint;
  expectedPayout: bigint;
};

function parseU64(bytes: number[]): bigint {
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value += BigInt(bytes[i] ?? 0) << BigInt(8 * i);
  }
  return value;
}

function findReturnTuple(
  results: Array<{ returnValues?: Array<[number[], string]> }> | null | undefined,
  count: number,
): bigint[] | null {
  for (const result of results ?? []) {
    const values = result.returnValues;
    if (values && values.length >= count) {
      return values.slice(0, count).map(([bytes]) => parseU64(bytes));
    }
  }
  return null;
}

/** Live Predict ask — no LeverX account required (same path as on-chain mint validation). */
export async function fetchPredictMarketAsk(params: {
  client: SuiJsonRpcClient;
  cfg: PredictQuoteConfig;
  key: MarketKeyArgs;
}): Promise<bigint | null> {
  const tx = new Transaction();
  tx.setSender(READONLY_SENDER);
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange ? "market_ask_range" : "market_ask_binary";

  tx.moveCall({
    target: `${params.cfg.packageId}::predict_client::${fn}`,
    arguments: [
      tx.object(params.cfg.predictId),
      tx.object(params.key.oracleId),
      marketKey,
      tx.pure.u64(PREDICT_QUOTE_REFERENCE_QUANTITY),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  try {
    const inspect = await params.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: READONLY_SENDER,
    });
    if (inspect.effects?.status?.status !== "success") return null;
    const tuple = findReturnTuple(inspect.results, 2);
    if (!tuple) return null;
    const [marketAskPerUnit] = tuple;
    if (classifyPredictPremium(marketAskPerUnit) !== "ok") return null;
    return marketAskPerUnit;
  } catch {
    return null;
  }
}

async function fetchMintBorrowQuote(params: {
  client: SuiJsonRpcClient;
  cfg: LeverxProtocolConfig;
  accountId: string;
  key: MarketKeyArgs;
  marginQuoteAtoms: bigint;
  leverageBps: bigint;
  quantity: bigint;
}): Promise<bigint | null> {
  const tx = new Transaction();
  tx.setSender(READONLY_SENDER);
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange
    ? "quote_leveraged_mint_range"
    : "quote_leveraged_mint_binary";

  tx.moveCall({
    target: `${params.cfg.packageId}::trade::${fn}`,
    typeArguments: [params.cfg.quoteType],
    arguments: [
      tx.object(params.cfg.registryId),
      tx.object(params.accountId),
      tx.object(params.cfg.predictId),
      tx.object(params.key.oracleId),
      marketKey,
      tx.pure.u64(params.marginQuoteAtoms),
      tx.pure.u64(params.leverageBps),
      tx.pure.u64(params.quantity),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  try {
    const inspect = await params.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: READONLY_SENDER,
    });
    if (inspect.effects?.status?.status !== "success") return null;
    const tuple = findReturnTuple(inspect.results, 3);
    return tuple?.[2] ?? null;
  } catch {
    return null;
  }
}

export async function fetchMintQuote(params: {
  client: SuiJsonRpcClient;
  cfg: LeverxProtocolConfig;
  accountId?: string | null;
  key: MarketKeyArgs;
  marginQuoteAtoms: bigint;
  leverageBps: bigint;
}): Promise<MintQuote | null> {
  const marketAskPerUnit = await fetchPredictMarketAsk({
    client: params.client,
    cfg: params.cfg,
    key: params.key,
  });
  if (marketAskPerUnit == null) return null;

  const tradeQuantity = estimateQuantity(
    params.marginQuoteAtoms,
    params.leverageBps,
    marketAskPerUnit,
  );
  const mintCost = costFromPremiumPerUnit(marketAskPerUnit, tradeQuantity);

  let borrowQuote = 0n;
  if (params.accountId && params.cfg.registryId) {
    const borrow = await fetchMintBorrowQuote({
      client: params.client,
      cfg: params.cfg,
      accountId: params.accountId,
      key: params.key,
      marginQuoteAtoms: params.marginQuoteAtoms,
      leverageBps: params.leverageBps,
      quantity: tradeQuantity,
    });
    if (borrow != null) borrowQuote = borrow;
  }

  return { marketAskPerUnit, mintCost, borrowQuote, tradeQuantity };
}

export async function fetchRedeemQuote(params: {
  client: SuiJsonRpcClient;
  cfg: LeverxProtocolConfig;
  key: MarketKeyArgs;
  quantity: bigint;
}): Promise<RedeemQuote | null> {
  const tx = new Transaction();
  tx.setSender(READONLY_SENDER);
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange
    ? "quote_leveraged_redeem_range"
    : "quote_leveraged_redeem_binary";

  tx.moveCall({
    target: `${params.cfg.packageId}::trade::${fn}`,
    arguments: [
      tx.object(params.cfg.registryId),
      tx.object(params.cfg.predictId),
      tx.object(params.key.oracleId),
      marketKey,
      tx.pure.u64(params.quantity),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  try {
    const inspect = await params.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: READONLY_SENDER,
    });
    if (inspect.effects?.status?.status !== "success") return null;
    const tuple = findReturnTuple(inspect.results, 2);
    if (!tuple) return null;
    const [marketBidPerUnit, expectedPayout] = tuple;
    return { marketBidPerUnit, expectedPayout };
  } catch {
    return null;
  }
}
