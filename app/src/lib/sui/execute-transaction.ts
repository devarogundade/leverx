import { signAndExecuteTransaction } from "@mysten/wallet-standard";
import {
  SUI_MAINNET_CHAIN,
  SUI_TESTNET_CHAIN,
  type WalletWithRequiredFeatures,
} from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { appConfig } from "@/lib/config";

const DEFAULT_GAS_BUDGET = 50_000_000;

function walletChain() {
  return appConfig.suiNetwork === "testnet" ? SUI_TESTNET_CHAIN : SUI_MAINNET_CHAIN;
}

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
    chain: walletChain(),
  });

  const finalized = await client.waitForTransaction({
    digest: result.digest,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (finalized.effects?.status?.status !== "success") {
    const err = finalized.effects?.status?.error;
    throw new Error(
      typeof err === "string" ? err : err ? JSON.stringify(err) : "Transaction failed on-chain",
    );
  }

  return { digest: result.digest };
}
