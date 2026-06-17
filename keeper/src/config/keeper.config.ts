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
  /** Optional shared secret for ops/admin HTTP routes (`x-keeper-api-key`). */
  apiKey: string;
  privateKey: string;
  suiNetwork: string;
  suiRpcUrl: string;
  /** Paid / higher-quota RPC used when the primary returns 429. */
  suiRpcFallbackUrl: string;
  packageId: string;
  registryId: string;
  vaultId: string;
  feeCollectorId: string;
  predictPackageId: string;
  predictId: string;
  predictServerUrl: string;
  quoteType: string;
  indexerUrl: string;
  /** Enoki private (secret) API key. When set, keeper gas is sponsored via Enoki. */
  enokiSecretKey: string;
  /** Enoki sponsorship network (defaults to `suiNetwork`). */
  enokiNetwork: string;
  cron: {
    limitOrder: string;
    liquidation: string;
    trigger: string;
    forceClose: string;
  };
  limits: {
    limitFills: number;
    liquidations: number;
    triggers: number;
    forceCloses: number;
  };
};

export { DEFAULT_PORT };

function envOrDefault(name: string, fallback: string): string {
  const value = (process.env[name] ?? '').trim();
  return value || fallback;
}

export default registerAs(
  'keeper',
  (): KeeperConfig => ({
    enabled: KEEPER_ENABLED,
    apiKey: (process.env.KEEPER_API_KEY ?? '').trim(),
    privateKey: (process.env.KEEPER_PRIVATE_KEY ?? '').trim(),
    suiNetwork: DEFAULT_SUI_NETWORK,
    suiRpcUrl: envOrDefault('SUI_RPC_URL', SUI_RPC_URLS[DEFAULT_SUI_NETWORK]),
    suiRpcFallbackUrl: (process.env.SUI_RPC_FALLBACK_URL ?? '').trim(),
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
    predictServerUrl: envOrDefault('PREDICT_SERVER_URL', TESTNET_PREDICT.serverUrl),
    quoteType: envOrDefault('QUOTE_TYPE', TESTNET_ASSETS.quoteType),
    indexerUrl: envOrDefault('INDEXER_URL', INDEXER_URL),
    enokiSecretKey: (process.env.ENOKI_SECRET_KEY ?? '').trim(),
    enokiNetwork: envOrDefault('ENOKI_NETWORK', DEFAULT_SUI_NETWORK),
    cron: { ...KEEPER_CRON_DEFAULTS },
    limits: { ...KEEPER_LIMIT_DEFAULTS },
  }),
);
