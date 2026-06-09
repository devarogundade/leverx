import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";
import { fetchAccounts } from "@/lib/leverx/indexer-client";
import { ONBOARD_GAS_BUDGET } from "@/lib/leverx/constants";
import type { LeverxProtocolConfig } from "@/lib/leverx/protocol";
import { executeWalletTransaction } from "@/lib/sui/execute-transaction";

export type LeverxAccount = {
  accountId: string;
  predictManagerId: string | null;
};

export class LeverxOnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeverxOnboardingError";
  }
}

async function findOwnedObjectId(
  client: SuiJsonRpcClient,
  owner: string,
  structType: string,
): Promise<string | null> {
  const page = await client.getOwnedObjects({
    owner,
    filter: { StructType: structType },
    options: { showContent: false },
  });
  return page.data[0]?.data?.objectId ?? null;
}

function extractCreatedId(
  objectChanges: Array<{ type?: string; objectType?: string; objectId?: string }> | undefined,
  typeFragment: string,
): string | null {
  for (const change of objectChanges ?? []) {
    if (
      change.type === "created" &&
      change.objectType?.includes(typeFragment) &&
      change.objectId
    ) {
      return change.objectId;
    }
  }
  return null;
}

export async function resolveLeverxAccount(
  client: SuiJsonRpcClient,
  owner: string,
  cfg: LeverxProtocolConfig,
): Promise<LeverxAccount | null> {
  try {
    const { items } = await fetchAccounts({ owner, limit: 5 });
    const row = items[0];
    if (row?.account_id) {
      return {
        accountId: row.account_id,
        predictManagerId: row.predict_manager_id,
      };
    }
  } catch {
    // Indexer may be offline — fall back to RPC.
  }

  const proxyId = await findOwnedObjectId(
    client,
    owner,
    `${cfg.packageId}::user_proxy::UserProxy`,
  );
  if (!proxyId) return null;

  const managerId = await findOwnedObjectId(
    client,
    owner,
    `${cfg.predictPackageId}::predict_manager::PredictManager`,
  );

  return {
    accountId: proxyId,
    predictManagerId: managerId,
  };
}

export async function ensureLeverxAccount(params: {
  client: SuiJsonRpcClient;
  wallet: WalletWithRequiredFeatures;
  account: WalletAccount;
  cfg: LeverxProtocolConfig;
}): Promise<LeverxAccount> {
  const existing = await resolveLeverxAccount(
    params.client,
    params.account.address,
    params.cfg,
  );

  if (existing?.accountId && existing.predictManagerId) {
    return {
      accountId: existing.accountId,
      predictManagerId: existing.predictManagerId,
    };
  }

  const ownedManager = await findOwnedObjectId(
    params.client,
    params.account.address,
    `${params.cfg.predictPackageId}::predict_manager::PredictManager`,
  );

  if (existing?.accountId && !existing.predictManagerId && ownedManager) {
    const { digest } = await executeWalletTransaction(
      params.client,
      params.wallet,
      params.account,
      (tx) => {
        tx.moveCall({
          target: `${params.cfg.packageId}::trade::link_predict_manager_entry`,
          arguments: [tx.object(existing.accountId), tx.pure.id(ownedManager)],
        });
      },
      { gasBudget: ONBOARD_GAS_BUDGET },
    );
    void digest;
    return { accountId: existing.accountId, predictManagerId: ownedManager };
  }

  if (existing?.accountId) {
    return existing;
  }

  const { digest } = await executeWalletTransaction(
    params.client,
    params.wallet,
    params.account,
    (tx) => {
      const managerIdArg = ownedManager
        ? tx.pure.id(ownedManager)
        : tx.moveCall({
            target: `${params.cfg.packageId}::predict_client::create_manager`,
            arguments: [],
          })[0]!;

      tx.moveCall({
        target: `${params.cfg.packageId}::trade::create_user_proxy`,
        arguments: [tx.object(params.cfg.deepbookRegistryId), managerIdArg],
      });
    },
    { gasBudget: ONBOARD_GAS_BUDGET },
  );

  const tx = await params.client.waitForTransaction({
    digest,
    options: { showObjectChanges: true },
  });

  const accountId = extractCreatedId(tx.objectChanges, "user_proxy::UserProxy");
  const managerId =
    ownedManager ?? extractCreatedId(tx.objectChanges, "predict_manager::PredictManager");

  if (!accountId) {
    throw new LeverxOnboardingError("UserProxy was not created.");
  }

  return {
    accountId,
    predictManagerId: managerId,
  };
}
