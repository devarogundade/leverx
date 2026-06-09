/** Launch collateral entry — on-chain whitelist is authoritative for LTV. */
export type CollateralCatalogEntry = {
  symbol: string;
  coinType: string;
  maxLtvBps: number;
  liquidationLtvBps?: number;
  /** Pyth `PriceInfoObject` for this collateral. */
  pythOracleId?: string;
  /** DeepBook spot pool for collateral ↔ quote swaps. */
  spotPoolId?: string;
};
