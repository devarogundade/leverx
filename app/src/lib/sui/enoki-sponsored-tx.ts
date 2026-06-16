import { EnokiClient, EnokiClientError, getSession } from "@mysten/enoki";
import {
  SUI_TESTNET_CHAIN,
  SuiSignTransaction,
  type WalletWithRequiredFeatures,
} from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { appConfig } from "@/lib/config";

const ENOKI_SPONSOR_FAILED =
  "Gas sponsorship failed. Add the new LeverX package move targets in the Enoki Developer Portal (Sponsored transactions), or add testnet SUI to your wallet via https://faucet.sui.io/?network=testnet";

function formatEnokiError(err: EnokiClientError): string {
  const detail = err.errors[0]?.message?.trim();
  if (detail) return `${ENOKI_SPONSOR_FAILED} (${detail})`;
  return ENOKI_SPONSOR_FAILED;
}

/** Sponsor, sign, and execute a user PTB via Enoki (Google zkLogin). */
export async function executeEnokiSponsoredTransaction(
  client: SuiJsonRpcClient,
  wallet: WalletWithRequiredFeatures,
  account: WalletAccount,
  build: (tx: Transaction) => void | Promise<void>,
  gasBudget: number,
): Promise<{ digest: string }> {
  const apiKey = appConfig.enokiApiKey?.trim();
  if (!apiKey) {
    throw new Error("Enoki is not configured for gas sponsorship.");
  }

  const session = await getSession(wallet);
  const jwt = session?.jwt;
  if (!jwt) {
    throw new Error("Enoki session expired. Log out and sign in with Google again.");
  }

  const tx = new Transaction();
  tx.setSender(account.address);
  tx.setGasBudget(gasBudget);
  await build(tx);

  const kindBytes = await tx.build({ client, onlyTransactionKind: true });
  const enoki = new EnokiClient({ apiKey });

  let sponsored: { bytes: string; digest: string };
  try {
    sponsored = await enoki.createSponsoredTransaction({
      network: appConfig.suiNetwork,
      transactionKindBytes: toBase64(kindBytes),
      jwt,
    });
  } catch (err) {
    if (err instanceof EnokiClientError) throw new Error(formatEnokiError(err));
    throw err;
  }

  const signFeature = wallet.features[SuiSignTransaction];
  if (!signFeature?.signTransaction) {
    throw new Error("Connected wallet cannot sign Enoki sponsored transactions.");
  }

  const sponsoredTx = Transaction.from(fromBase64(sponsored.bytes));
  const { signature } = await signFeature.signTransaction({
    transaction: {
      toJSON: () => sponsoredTx.toJSON({ client }),
    },
    account,
    chain: SUI_TESTNET_CHAIN,
  });

  let executed: { digest: string };
  try {
    executed = await enoki.executeSponsoredTransaction({
      digest: sponsored.digest,
      signature,
    });
  } catch (err) {
    if (err instanceof EnokiClientError) throw new Error(formatEnokiError(err));
    throw err;
  }

  const finalized = await client.waitForTransaction({
    digest: executed.digest,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (finalized.effects?.status?.status !== "success") {
    const err = finalized.effects?.status?.error;
    throw new Error(
      typeof err === "string" ? err : err ? JSON.stringify(err) : "Transaction failed on-chain",
    );
  }

  return { digest: executed.digest };
}
