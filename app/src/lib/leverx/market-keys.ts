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
