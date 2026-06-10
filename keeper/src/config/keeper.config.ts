import { registerAs } from '@nestjs/config';
import {
  DEFAULT_PORT,
  DEFAULT_SUI_NETWORK,
  INDEXER_URL,
  KEEPER_CRON_DEFAULTS,
  KEEPER_ENABLED,
  KEEPER_LIMIT_DEFAULTS,
  SUI_RPC_URLS,
  TESTNET_ASSETS,
  TESTNET_LEVERX,
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

function envOrDefault(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value || fallback;
}

export default registerAs(
  'keeper',
  (): KeeperConfig => ({
    enabled: KEEPER_ENABLED,
    privateKey: (process.env.KEEPER_PRIVATE_KEY ?? '').trim(),
    suiNetwork: DEFAULT_SUI_NETWORK,
    suiRpcUrl: SUI_RPC_URLS[DEFAULT_SUI_NETWORK],
    packageId: envOrDefault('LEVERX_PACKAGE_ID', TESTNET_LEVERX.packageId),
    registryId: envOrDefault('LEVERX_REGISTRY_ID', TESTNET_LEVERX.registryId),
    vaultId: envOrDefault('LEVERX_VAULT_ID', TESTNET_LEVERX.vaultId),
    feeCollectorId: envOrDefault(
      'LEVERX_FEE_COLLECTOR_ID',
      TESTNET_LEVERX.feeCollectorId,
    ),
    predictPackageId: envOrDefault(
      'PREDICT_PACKAGE_ID',
      TESTNET_PREDICT.packageId,
    ),
    predictId: envOrDefault('PREDICT_ID', TESTNET_PREDICT.sharedObjectId),
    predictServerUrl: TESTNET_PREDICT.serverUrl,
    quoteType: envOrDefault('QUOTE_TYPE', TESTNET_ASSETS.quoteType),
    indexerUrl: (process.env.INDEXER_URL ?? INDEXER_URL).trim(),
    cron: { ...KEEPER_CRON_DEFAULTS },
    limits: { ...KEEPER_LIMIT_DEFAULTS },
  }),
);
