/**
 * Testnet integration — see:
 * - docs/DEEPBOOK_PREDICT.md (workshop FAQ)
 * - https://docs.sui.io/onchain-finance/deepbook-predict/contract-information
 * Predict testnet expirations: 1, 2, 7, 14, 21 days.
 *
 * Built-in defaults below — no .env file required for local dev or deploy.
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

/** DeepBook V3 testnet (predict-testnet-4-16) — balance manager registry for UserProxy onboarding. */
const TESTNET_DEEPBOOK = {
  registryId: "0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1",
} as const;

/** Published LeverX package + shared objects (testnet). */
const TESTNET_LEVERX = {
  packageId:
    "0x0d97963b7032ca790844559446a8fb4b036d00d0c7e50f338840d4ad6d109a20",
  registryId:
    "0x7e36d8362e5315ea97b2f374c90b96d1a8d3e93a1ceb5dbc54acf40bae1c17e2",
  vaultId:
    "0x4e3d2d54c5b3ac7f0d65be9515a50da4cf72e7388ef985298c417f4c8b8317a7",
  feeCollectorId:
    "0x66a202c6ed7a2bb451da7d049cb0f82b0780e95307c5966c1c187d5c32493110",
} as const;

export const appConfig = {
  suiNetwork: "testnet" as const,

  predictServerUrl: TESTNET_PREDICT.serverUrl,
  predictId: TESTNET_PREDICT.predictId,
  predictPackageId: TESTNET_PREDICT.packageId,
  predictRegistryId: TESTNET_PREDICT.registryId,
  deepbookRegistryId:
    import.meta.env.VITE_DEEPBOOK_REGISTRY_ID ?? TESTNET_DEEPBOOK.registryId,
  quoteType: TESTNET_PREDICT.quoteType,

  leverxPackageId:
    import.meta.env.VITE_LEVERX_PACKAGE_ID ?? TESTNET_LEVERX.packageId,
  leverxRegistryId: TESTNET_LEVERX.registryId,
  leverxVaultId: TESTNET_LEVERX.vaultId,
  feeCollectorId: TESTNET_LEVERX.feeCollectorId,

  /** Vault/manager legacy paths; oracle catalog always uses predictServerUrl. */
  usePredictServer: false,

  /** LeverX on-chain indexer (order book, positions, limits). */
  leverxIndexerUrl:
    import.meta.env.VITE_LEVERX_INDEXER_URL ?? "http://localhost:3100",
} as const;
