import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { appConfig } from "@/lib/config";

export type MarketKeyArgs = {
  oracleId: string;
  expiryMs: number;
  strike: number;
  higherStrike?: number;
  isUp: boolean;
  isRange: boolean;
};

export function marketKeyMatchesPosition(
  key: MarketKeyArgs,
  position: {
    position_key: string;
    oracle_id: string;
    expiry_ms: number;
    strike: number;
    higher_strike: number;
    is_up: boolean;
    is_range: boolean;
  },
): boolean {
  return positionKeyFromArgs(key) === position.position_key;
}

/** Canonical `position_key` / `market_key` string (matches indexer encoding). */
export function positionKeyFromArgs(args: MarketKeyArgs): string {
  const higherStrike = args.isRange ? (args.higherStrike ?? 0) : 0;
  const isUp = args.isRange ? true : args.isUp;
  return `${args.oracleId}:${args.expiryMs}:${args.strike}:${higherStrike}:${isUp ? 1 : 0}:${args.isRange ? 1 : 0}`;
}

export function addMarketKey(
  tx: Transaction,
  args: MarketKeyArgs,
): TransactionObjectArgument {
  const pkg = appConfig.predictPackageId;

  if (args.isRange) {
    return tx.moveCall({
      target: `${pkg}::range_key::new`,
      arguments: [
        tx.pure.id(args.oracleId),
        tx.pure.u64(args.expiryMs),
        tx.pure.u64(args.strike),
        tx.pure.u64(args.higherStrike ?? 0),
      ],
    })[0]!;
  }

  const fn = args.isUp ? "up" : "down";
  return tx.moveCall({
    target: `${pkg}::market_key::${fn}`,
    arguments: [
      tx.pure.id(args.oracleId),
      tx.pure.u64(args.expiryMs),
      tx.pure.u64(args.strike),
    ],
  })[0]!;
}
