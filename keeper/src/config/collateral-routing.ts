import type { CollateralCatalogEntry } from './collateral-catalog';
import type { KeeperConfig } from './keeper.config';

export type CollateralRoute = {
  coinType: string;
  pythOracleId: string;
  /** Collateral is the vault quote asset (e.g. dUSDC) — no DeepBook spot swap. */
  quoteNative: boolean;
  spotPoolId: string | null;
  deepCoinId: string | null;
};

export function isQuoteNativeCollateral(
  coinType: string,
  quoteType: string,
): boolean {
  return coinType.trim() === quoteType.trim();
}

function resolvePythOracleId(
  cfg: KeeperConfig,
  coinType: string,
  entry?: CollateralCatalogEntry,
): string {
  return (
    entry?.pythOracleId?.trim() ||
    (coinType === cfg.collateralType ? cfg.pythCollateralOracleId.trim() : '')
  );
}

function resolveSpotPoolId(
  cfg: KeeperConfig,
  coinType: string,
  entry?: CollateralCatalogEntry,
): string {
  return (
    entry?.spotPoolId?.trim() ||
    (coinType === cfg.collateralType ? cfg.spotPoolId.trim() : '')
  );
}

function resolveDeepCoinId(
  cfg: KeeperConfig,
  coinType: string,
  entry?: CollateralCatalogEntry,
): string {
  return (
    entry?.deepCoinId?.trim() ||
    (coinType === cfg.collateralType ? cfg.deepCoinId.trim() : '')
  );
}

/** Resolve Pyth oracle wiring for any whitelisted collateral (limit fills, health checks). */
export function resolveCollateralRoute(
  cfg: KeeperConfig,
  collateralAsset: string | null | undefined,
): CollateralRoute | null {
  const coinType = (collateralAsset ?? cfg.collateralType).trim();
  if (!coinType) return null;

  const entry = cfg.supportedCollaterals.find((c) => c.coinType === coinType);
  const pythOracleId = resolvePythOracleId(cfg, coinType, entry);
  if (!pythOracleId) return null;

  const quoteNative = isQuoteNativeCollateral(coinType, cfg.quoteType);
  const spotPoolId = resolveSpotPoolId(cfg, coinType, entry) || null;
  const deepCoinId = resolveDeepCoinId(cfg, coinType, entry) || null;

  return { coinType, pythOracleId, quoteNative, spotPoolId, deepCoinId };
}

/** DeepBook spot pool + DEEP fee coin required for non-quote-native liquidations. */
export function hasSpotLiquidationRoute(route: CollateralRoute): boolean {
  return Boolean(route.spotPoolId && route.deepCoinId);
}

export function catalogHasLiquidationRoute(
  collaterals: CollateralCatalogEntry[],
  quoteType: string,
): boolean {
  return collaterals.some((c) => {
    if (!c.coinType?.trim() || !c.pythOracleId?.trim()) return false;
    if (isQuoteNativeCollateral(c.coinType, quoteType)) return true;
    return Boolean(c.spotPoolId?.trim() && c.deepCoinId?.trim());
  });
}

export function liquidationRoutesReady(cfg: KeeperConfig): boolean {
  if (catalogHasLiquidationRoute(cfg.supportedCollaterals, cfg.quoteType)) {
    return true;
  }
  if (!cfg.pythCollateralOracleId.trim()) return false;
  if (isQuoteNativeCollateral(cfg.collateralType, cfg.quoteType)) return true;
  return Boolean(cfg.spotPoolId.trim() && cfg.deepCoinId.trim());
}

/** Flash borrow = indexed debt + interest buffer (basis points). */
export function flashBorrowAmount(
  debt: number | bigint,
  bufferBps: number,
): bigint {
  const d = BigInt(debt);
  return d + (d * BigInt(bufferBps)) / 10_000n;
}

/** Minimum quote out from spot swap during liquidation (slippage guard). */
export function liquidationMinQuoteOut(
  borrowAmount: bigint,
  slippageBps: number,
): bigint {
  return (borrowAmount * BigInt(10_000 - slippageBps)) / 10_000n;
}
