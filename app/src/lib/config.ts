/**
 * Testnet integration — see:
 * - docs/DEEPBOOK_PREDICT.md (workshop FAQ)
 * - https://docs.sui.io/onchain-finance/deepbook-predict/contract-information
 * Predict testnet expirations: 1, 2, 7, 14, 21 days.
 *
 * Defaults mirror `contracts/deploy-testnet.env` (publish tx 4Z9muXk…).
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
    "0xe6345a6251057614904a4de8971cfd5d9d7dd5ce6bb7b4c036ca13e8f0dcbd78",
  registryId:
    "0x63a9128e375110edd51b7abc57de2b37eacdd1cf06ae72339e5bc41da791d3d5",
  vaultId:
    "0xa541e32a9338fca1953a5626a238f1723b969839a3896ff61a174b34e4c30b0a",
  feeCollectorId:
    "0xe506020d1f29c88c00f91460af0197760b1fce5893a680c386595f1b508d2cd2",
} as const;

function viteEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === "string" ? value.trim() : "";
}

export const appConfig = {
  suiNetwork: "testnet" as const,

  predictServerUrl: TESTNET_PREDICT.serverUrl,
  predictId: viteEnv("VITE_PREDICT_ID") || TESTNET_PREDICT.predictId,
  predictPackageId: viteEnv("VITE_PREDICT_PACKAGE_ID") || TESTNET_PREDICT.packageId,
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
