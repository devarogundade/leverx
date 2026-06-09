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

/** Published LeverX package (testnet). */
const TESTNET_LEVERX = {
  packageId:
    "0x8780ec7cfae9d333ba11325bb078fa79d5942aa077a739e7ad6683ea8f5ed36d",
  feeCollectorId:
    "0x4fcd19f16566024cd13ee49b3926f2d3c763a392a5988748d738d545e9f238a8",
  pythQuoteOracleId:
    import.meta.env.VITE_PYTH_QUOTE_ORACLE_ID ??
    "0x9c4dd4008297ffa5e480684b8100ec21cc934405ed9a25d4e4d7b6259aad9c81",
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
  feeCollectorId: TESTNET_LEVERX.feeCollectorId,
  pythQuoteOracleId: TESTNET_LEVERX.pythQuoteOracleId,

  /** Vault/manager legacy paths; oracle catalog always uses predictServerUrl. */
  usePredictServer: false,

  /** LeverX on-chain indexer (order book, positions, limits). */
  leverxIndexerUrl:
    import.meta.env.VITE_LEVERX_INDEXER_URL ?? "http://localhost:3100",
} as const;
