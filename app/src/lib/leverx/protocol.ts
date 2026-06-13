import { appConfig } from "@/lib/config";
import type { ProtocolSettings } from "@/lib/leverx/indexer-client";

/** Default on-chain liquidation health threshold (basis points). */
export const DEFAULT_LIQUIDATION_BPS = 9_500;

/** Margin-call band uses registry `liquidation_bps` when available. */
export const MARGIN_CALL_BPS = DEFAULT_LIQUIDATION_BPS;

export function resolveLiquidationBps(
  settings?: Pick<ProtocolSettings, "liquidation_bps"> | null,
): number {
  const bps = settings?.liquidation_bps;
  return typeof bps === "number" && bps > 0 ? bps : DEFAULT_LIQUIDATION_BPS;
}

export function liquidationEventKindLabel(kind: string): string {
  switch (kind) {
    case "force_deleverage":
      return "Force deleveraged";
    case "bad_debt":
      return "Bad debt";
    default:
      return "Liquidated";
  }
}

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

function nonEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export type LeverxPackageOverrides = {
  packageId?: string | null;
  predictPackageId?: string | null;
  /** When false, omit env fallbacks for package IDs (wait for on-chain resolution). */
  allowEnvPackageFallback?: boolean;
};

export function resolveLeverxOnboardingConfig(
  overrides?: Pick<LeverxPackageOverrides, "packageId" | "predictPackageId" | "allowEnvPackageFallback">,
): LeverxOnboardingConfig {
  const allowEnv = overrides?.allowEnvPackageFallback !== false;
  const packageId =
    nonEmpty(overrides?.packageId) || (allowEnv ? appConfig.leverxPackageId : "");
  const predictPackageId =
    nonEmpty(overrides?.predictPackageId) ||
    (allowEnv ? appConfig.predictPackageId : "");

  return { packageId, predictPackageId };
}

export function resolveLeverxProtocol(
  settings: ProtocolSettings | null | undefined,
  overrides?: LeverxPackageOverrides,
): LeverxProtocolConfig | null {
  const allowEnv = overrides?.allowEnvPackageFallback !== false;
  const registryId =
    nonEmpty(settings?.registry_id) || appConfig.leverxRegistryId;
  const vaultId = nonEmpty(settings?.vault_id) || appConfig.leverxVaultId;
  const packageId =
    nonEmpty(overrides?.packageId) ||
    nonEmpty(settings?.package_id) ||
    (allowEnv ? appConfig.leverxPackageId : "");
  const feeCollectorId =
    nonEmpty(settings?.fee_collector_id) || appConfig.feeCollectorId;
  const predictPackageId =
    nonEmpty(overrides?.predictPackageId) ||
    nonEmpty(settings?.predict_package_id) ||
    (allowEnv ? appConfig.predictPackageId : "");

  if (!packageId || !registryId || !vaultId || !feeCollectorId || !predictPackageId) {
    return null;
  }

  return {
    packageId,
    registryId,
    vaultId,
    feeCollectorId,
    predictId: nonEmpty(settings?.predict_id) || appConfig.predictId,
    predictRegistryId: appConfig.predictRegistryId,
    predictPackageId,
    quoteType: appConfig.quoteType,
  };
}

export function lxplpCoinType(packageId: string): string {
  return `${packageId}::lxplp::LXPLP`;
}
