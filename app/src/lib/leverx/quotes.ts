import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { READONLY_SENDER } from "@/context/WalletContext";
import { SUI_CLOCK_OBJECT_ID } from "@/lib/leverx/constants";
import { addMarketKey, type MarketKeyArgs } from "@/lib/leverx/market-keys";
import type { CollateralRoute, LeverxProtocolConfig } from "@/lib/leverx/protocol";

export type MintQuote = {
  marketAskPerUnit: bigint;
  mintCost: bigint;
  borrowQuote: bigint;
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

function parseReturnTuple(
  results: Array<{ returnValues?: Array<[number[], string]> }> | undefined,
  index: number,
  count: number,
): bigint[] {
  const values = results?.[index]?.returnValues;
  if (!values || values.length < count) {
    throw new Error("Quote inspect returned incomplete values.");
  }
  return values.slice(0, count).map(([bytes]) => parseU64(bytes));
}

export async function fetchMintQuote(params: {
  client: SuiJsonRpcClient;
  cfg: LeverxProtocolConfig;
  route: CollateralRoute;
  accountId?: string | null;
  key: MarketKeyArgs;
  marginQuoteAtoms: bigint;
  leverageBps: bigint;
  quantity: bigint;
}): Promise<MintQuote | null> {
  if (!params.accountId) return null;

  const tx = new Transaction();
  tx.setSender(READONLY_SENDER);
  const marketKey = addMarketKey(tx, params.key);
  const fn = params.key.isRange
    ? "quote_leveraged_mint_range"
    : "quote_leveraged_mint_binary";

  tx.moveCall({
    target: `${params.cfg.packageId}::trade::${fn}`,
    typeArguments: [params.route.coinType, params.cfg.quoteType],
    arguments: [
      tx.object(params.cfg.registryId),
      tx.object(params.accountId),
      tx.object(params.cfg.predictId),
      tx.object(params.key.oracleId),
      tx.object(params.route.pythOracleId),
      tx.object(params.cfg.pythQuoteOracleId),
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
    const [marketAskPerUnit, mintCost, borrowQuote] = parseReturnTuple(
      inspect.results,
      0,
      3,
    );
    return { marketAskPerUnit, mintCost, borrowQuote };
  } catch {
    return null;
  }
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
    const [marketBidPerUnit, expectedPayout] = parseReturnTuple(inspect.results, 0, 2);
    return { marketBidPerUnit, expectedPayout };
  } catch {
    return null;
  }
}
