/**
 * Testnet integration — see:
 * - docs/DEEPBOOK_PREDICT.md (workshop FAQ)
 * - https://docs.sui.io/onchain-finance/deepbook-predict/contract-information
 * Predict testnet expirations: 1, 2, 7, 14, 21 days.
 *
 * Defaults mirror `contracts/deploy-testnet.env` (publish tx 866WrEo…).
 * Shared object IDs (registry, vault, fee collector) come from the indexer
 * `/v1/protocol` after `deploy_and_share`, or optional `VITE_LEVERX_*` env vars.
 */

/** DeepBook Predict testnet (predict-testnet-4-16). */
const TESTNET_PREDICT = {
  serverUrl: "https://predict-server.testnet.mystenlabs.com",
  predictId: "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
  packageId: "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
  registryId: "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
  quoteType:
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
} as const;

/** Published LeverX package (testnet). Shared objects filled via indexer or .env. */
const TESTNET_LEVERX = {
  packageId:
    "0x81e913fc694919d1fca5ebc78c05d996a77d050a9568e6d055825acd339baae1",
  registryId: "",
  vaultId: "",
  feeCollectorId: "",
} as const;

function viteEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === "string" ? value.trim() : "";
}

export const appConfig = {
  suiNetwork: "testnet" as const,

  predictServerUrl: TESTNET_PREDICT.serverUrl,
  predictId: TESTNET_PREDICT.predictId,
  predictPackageId: TESTNET_PREDICT.packageId,
  predictRegistryId: TESTNET_PREDICT.registryId,
  quoteType: TESTNET_PREDICT.quoteType,

  leverxPackageId: viteEnv("VITE_LEVERX_PACKAGE_ID") || TESTNET_LEVERX.packageId,
  leverxRegistryId: viteEnv("VITE_LEVERX_REGISTRY_ID") || TESTNET_LEVERX.registryId,
  leverxVaultId: viteEnv("VITE_LEVERX_VAULT_ID") || TESTNET_LEVERX.vaultId,
  feeCollectorId:
    viteEnv("VITE_LEVERX_FEE_COLLECTOR_ID") || TESTNET_LEVERX.feeCollectorId,

  /** Vault/manager legacy paths; oracle catalog always uses predictServerUrl. */
  usePredictServer: false,

  /** LeverX on-chain indexer (order book, positions, limits). */
  leverxIndexerUrl:
    import.meta.env.VITE_LEVERX_INDEXER_URL ?? "http://localhost:3100",

  /** DeepBook spot OHLCV (chart visualization only). */
  deepbookIndexerUrl:
    viteEnv("VITE_DEEPBOOK_INDEXER_URL") ||
    "https://deepbook-indexer.mainnet.mystenlabs.com",
} as const;
