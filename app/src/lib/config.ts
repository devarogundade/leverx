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
    "0x4275c1990b8182c59a638abdc4922303f9e77bae92fcb1cc519f25a97fc8c7cb",
  registryId:
    "0x00235fa4d1ca972353e8bafa51bb1e0450d7f3467d96e066a86e42263f8462d8",
  vaultId:
    "0x011dece1b6c222fc352e7979d7c5c97d215db522821377a85208d2ec4e788fab",
  feeCollectorId:
    "0xdfb7203456a4061d860f7051a97d981063531167b74a2f4897c0a472c2477d22",
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
