import { signAndExecuteTransaction } from "@mysten/wallet-standard";
import { SUI_TESTNET_CHAIN, type WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const DEFAULT_GAS_BUDGET = 50_000_000;

/** Build and sign a single Sui PTB (`Transaction`) via the wallet. */
export async function executeWalletTransaction(
  client: SuiJsonRpcClient,
  wallet: WalletWithRequiredFeatures,
  account: WalletAccount,
  build: (tx: Transaction) => void | Promise<void>,
  options?: { gasBudget?: number },
): Promise<{ digest: string }> {
  const tx = new Transaction();
  tx.setSender(account.address);
  tx.setGasBudget(options?.gasBudget ?? DEFAULT_GAS_BUDGET);
  await build(tx);

  const transactionForWallet = {
    toJSON: () => tx.toJSON({ client }),
  };

  const result = await signAndExecuteTransaction(wallet, {
    transaction: transactionForWallet,
    account,
    chain: SUI_TESTNET_CHAIN,
  });

  await client.waitForTransaction({
    digest: result.digest,
    options: { showEffects: true, showObjectChanges: true },
  });

  return { digest: result.digest };
}
