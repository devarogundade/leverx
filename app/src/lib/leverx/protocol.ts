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
  quoteType: string;
};

/** Fields required for onboarding PTBs (`create_user_proxy`, `link_predict_manager`). */
export type LeverxOnboardingConfig = Pick<
  LeverxProtocolConfig,
  "packageId" | "predictPackageId"
>;

/** Margin-call threshold (95%). */
export const MARGIN_CALL_BPS = 9_500;

function nonEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function resolveLeverxOnboardingConfig(): LeverxOnboardingConfig {
  return {
    packageId: appConfig.leverxPackageId,
    predictPackageId: appConfig.predictPackageId,
  };
}

export function resolveLeverxProtocol(
  settings: ProtocolSettings | null | undefined,
): LeverxProtocolConfig | null {
  const registryId =
    nonEmpty(settings?.registry_id) || appConfig.leverxRegistryId;
  const vaultId = nonEmpty(settings?.vault_id) || appConfig.leverxVaultId;
  const packageId = appConfig.leverxPackageId;
  const feeCollectorId =
    nonEmpty(settings?.fee_collector_id) || appConfig.feeCollectorId;

  if (!packageId || !registryId || !vaultId || !feeCollectorId) {
    return null;
  }

  return {
    packageId,
    registryId,
    vaultId,
    feeCollectorId,
    predictId: nonEmpty(settings?.predict_id) || appConfig.predictId,
    predictRegistryId: appConfig.predictRegistryId,
    predictPackageId: appConfig.predictPackageId,
    quoteType: appConfig.quoteType,
  };
}

export function lxplpCoinType(packageId: string): string {
  return `${packageId}::lxplp::LXPLP`;
}
