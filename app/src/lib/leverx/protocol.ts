import { appConfig } from "@/lib/config";
import type { ProtocolSettings } from "@/lib/leverx/indexer-client";

export type LeverxProtocolConfig = {
  packageId: string;
  registryId: string;
  vaultId: string;
  feeCollectorId: string;
  predictId: string;
  predictRegistryId: string;
  predictPackageId: string;
  deepbookRegistryId: string;
  quoteType: string;
};

/** Fixed 1:1 leverage in basis points. */
export const LEVERAGE_BPS = 10_000n;

/** Margin-call threshold (95%). */
export const MARGIN_CALL_BPS = 9_500;

export function resolveLeverxProtocol(
  settings: ProtocolSettings | null | undefined,
): LeverxProtocolConfig | null {
  const registryId = settings?.registry_id ?? appConfig.leverxRegistryId;
  const vaultId = settings?.vault_id ?? appConfig.leverxVaultId;
  const packageId = appConfig.leverxPackageId;
  const feeCollectorId = settings?.fee_collector_id ?? appConfig.feeCollectorId;

  if (!packageId || !registryId || !vaultId || !feeCollectorId) {
    return null;
  }

  return {
    packageId,
    registryId,
    vaultId,
    feeCollectorId,
    predictId: settings?.predict_id ?? appConfig.predictId,
    predictRegistryId: appConfig.predictRegistryId,
    predictPackageId: appConfig.predictPackageId,
    deepbookRegistryId: appConfig.deepbookRegistryId,
    quoteType: appConfig.quoteType,
  };
}

export function lxplpCoinType(packageId: string): string {
  return `${packageId}::lxplp::LXPLP`;
}
