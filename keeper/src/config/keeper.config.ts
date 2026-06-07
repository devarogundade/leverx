import { registerAs } from '@nestjs/config';
import type { CollateralCatalogEntry } from './collateral-catalog';
import {
  DEFAULT_PORT,
  DEFAULT_SUI_NETWORK,
  INDEXER_URL,
  KEEPER_CRON_DEFAULTS,
  KEEPER_ENABLED,
  KEEPER_LIMIT_DEFAULTS,
  LAUNCH_COLLATERAL_CATALOG,
  SUI_RPC_URLS,
  TESTNET_ASSETS,
  TESTNET_LEVERX,
  TESTNET_LIQUIDATION,
  TESTNET_PREDICT,
} from './constants';

export type KeeperConfig = {
  enabled: boolean;
  privateKey: string;
  suiNetwork: string;
  suiRpcUrl: string;
  packageId: string;
  registryId: string;
  vaultId: string;
  feeCollectorId: string;
  predictPackageId: string;
  predictId: string;
  predictServerUrl: string;
  quoteType: string;
  collateralType: string;
  spotPoolId: string;
  pythCollateralOracleId: string;
  pythQuoteOracleId: string;
  deepCoinId: string;
  supportedCollaterals: CollateralCatalogEntry[];
  indexerUrl: string;
  cron: {
    settlement: string;
    limitOrder: string;
    liquidation: string;
    trigger: string;
  };
  limits: {
    settlements: number;
    limitFills: number;
    liquidations: number;
    triggers: number;
  };
};

export { DEFAULT_PORT };

export default registerAs(
  'keeper',
  (): KeeperConfig => ({
    enabled: KEEPER_ENABLED,
    privateKey: (process.env.KEEPER_PRIVATE_KEY ?? '').trim(),
    suiNetwork: DEFAULT_SUI_NETWORK,
    suiRpcUrl: SUI_RPC_URLS[DEFAULT_SUI_NETWORK],
    packageId: TESTNET_LEVERX.packageId,
    registryId: TESTNET_LEVERX.registryId,
    vaultId: TESTNET_LEVERX.vaultId,
    feeCollectorId: TESTNET_LEVERX.feeCollectorId,
    predictPackageId: TESTNET_PREDICT.packageId,
    predictId: TESTNET_PREDICT.sharedObjectId,
    predictServerUrl: TESTNET_PREDICT.serverUrl,
    quoteType: TESTNET_ASSETS.quoteType,
    collateralType: TESTNET_ASSETS.defaultCollateralType,
    spotPoolId: TESTNET_LIQUIDATION.spotPoolId,
    pythCollateralOracleId: TESTNET_LIQUIDATION.pythCollateralOracleId,
    pythQuoteOracleId: TESTNET_LIQUIDATION.pythQuoteOracleId,
    deepCoinId: TESTNET_LIQUIDATION.deepCoinId,
    supportedCollaterals: LAUNCH_COLLATERAL_CATALOG,
    indexerUrl: INDEXER_URL,
    cron: { ...KEEPER_CRON_DEFAULTS },
    limits: { ...KEEPER_LIMIT_DEFAULTS },
  }),
);
