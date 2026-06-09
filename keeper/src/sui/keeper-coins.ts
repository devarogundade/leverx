import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { DEEP_COIN_TYPE } from '../config/constants';

export class KeeperCoinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeeperCoinError';
  }
}

/** Merge keeper-owned DEEP coins into one PTB object for DeepBook swap fees. */
export async function addKeeperDeepFeeCoin(
  client: SuiJsonRpcClient,
  owner: string,
  tx: Transaction,
): Promise<TransactionObjectArgument> {
  const coins = await client.getCoins({
    owner,
    coinType: DEEP_COIN_TYPE,
    limit: 50,
  });
  if (coins.data.length === 0) {
    throw new KeeperCoinError('keeper has no DEEP coins for swap fees');
  }

  const primaryId = coins.data[0]!.coinObjectId;
  const primary = tx.object(primaryId);

  if (coins.data.length > 1) {
    tx.mergeCoins(
      primary,
      coins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  }

  return primary;
}
