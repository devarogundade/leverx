import { appConfig } from "@/lib/config";
import { leverxCollateralCatalog } from "@/lib/leverx/collateral-catalog";
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
  pythQuoteOracleId: string;
};

export type CollateralRoute = {
  coinType: string;
  pythOracleId: string;
  maxLtvBps: number;
  decimals: number;
};

export function resolveLeverxProtocol(
  settings: ProtocolSettings | null | undefined,
): LeverxProtocolConfig | null {
  const registryId = settings?.registry_id ?? "";
  const vaultId = settings?.vault_id ?? "";
  const packageId = appConfig.leverxPackageId;
  const feeCollectorId = settings?.fee_collector_id ?? appConfig.feeCollectorId;

  if (!packageId || !registryId || !vaultId || !feeCollectorId) {
    return null;
  }

  if (!appConfig.pythQuoteOracleId) {
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
    quoteType: appConfig.quoteType,
    pythQuoteOracleId: appConfig.pythQuoteOracleId,
  };
}

/** Resolve Pyth oracle + decimals for a collateral coin type. */
export function resolveCollateralRoute(
  coinType: string,
  catalogMaxLtvBps?: number,
  catalogDecimals?: number,
): CollateralRoute | null {
  const envEntry = leverxCollateralCatalog().find(
    (e) => e.coinType === coinType || e.coinType.endsWith(coinType.split("::").pop() ?? ""),
  );
  const pythOracleId = envEntry?.pythOracleId ?? "";
  if (!pythOracleId) return null;

  const decimals = catalogDecimals ?? (coinType.includes("sui::SUI") ? 9 : 6);

  return {
    coinType,
    pythOracleId,
    maxLtvBps: catalogMaxLtvBps ?? envEntry?.maxLtvBps ?? 8_000,
    decimals,
  };
}

export function lxplpCoinType(packageId: string): string {
  return `${packageId}::lxplp::LXPLP`;
}
