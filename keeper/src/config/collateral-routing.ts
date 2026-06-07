import type { CollateralCatalogEntry } from './collateral-catalog';
import type { KeeperConfig } from './keeper.config';

export type CollateralRoute = {
  coinType: string;
  spotPoolId: string;
  pythOracleId: string;
  deepCoinId: string;
};

/** Resolve per-asset liquidation / limit-fill wiring from the launch catalog. */
export function resolveCollateralRoute(
  cfg: KeeperConfig,
  collateralAsset: string | null | undefined,
): CollateralRoute | null {
  const coinType = (collateralAsset ?? cfg.collateralType).trim();
  if (!coinType) return null;

  const entry = cfg.supportedCollaterals.find((c) => c.coinType === coinType);
  const spotPoolId =
    entry?.spotPoolId?.trim() ||
    (coinType === cfg.collateralType ? cfg.spotPoolId.trim() : '');
  const pythOracleId =
    entry?.pythOracleId?.trim() ||
    (coinType === cfg.collateralType ? cfg.pythCollateralOracleId.trim() : '');
  const deepCoinId =
    entry?.deepCoinId?.trim() ||
    (coinType === cfg.collateralType ? cfg.deepCoinId.trim() : '');

  if (!spotPoolId || !pythOracleId || !deepCoinId) return null;
  return { coinType, spotPoolId, pythOracleId, deepCoinId };
}

export function catalogHasLiquidationRoute(
  collaterals: CollateralCatalogEntry[],
): boolean {
  return collaterals.some(
    (c) =>
      Boolean(c.coinType?.trim()) &&
      Boolean(c.spotPoolId?.trim()) &&
      Boolean(c.pythOracleId?.trim()) &&
      Boolean(c.deepCoinId?.trim()),
  );
}

export function liquidationRoutesReady(cfg: KeeperConfig): boolean {
  if (catalogHasLiquidationRoute(cfg.supportedCollaterals)) return true;
  return Boolean(
    cfg.collateralType.trim() &&
      cfg.spotPoolId.trim() &&
      cfg.pythCollateralOracleId.trim() &&
      cfg.deepCoinId.trim(),
  );
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
