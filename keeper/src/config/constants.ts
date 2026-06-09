import type { CollateralCatalogEntry } from './collateral-catalog';

/**
 * Keeper configuration — edit this file for testnet deploy IDs, liquidation wiring, etc.
 * The only value in `keeper/.env` is `KEEPER_PRIVATE_KEY`.
 */

/** DeepBook Predict testnet (rev predict-testnet-4-16). */
export const TESTNET_PREDICT = {
  packageId:
    '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  sharedObjectId:
    '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  registryId:
    '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
  serverUrl: 'https://predict-server.testnet.mystenlabs.com',
} as const;

/** Published LeverX package + shared objects (testnet). */
export const TESTNET_LEVERX = {
  packageId:
    '0x8780ec7cfae9d333ba11325bb078fa79d5942aa077a739e7ad6683ea8f5ed36d',
  registryId:
    '0xf6393b143c0c3a03179ff4a3bf3eba5f56831c8582881800e05f226ea239480c',
  vaultId: '0x62a4b9098943c1133668265721c4b4eb9d174d444e0b797bb1865f31eccded93',
  feeCollectorId:
    '0x4fcd19f16566024cd13ee49b3926f2d3c763a392a5988748d738d545e9f238a8',
} as const;

/** Quote / default collateral coin types on testnet. */
export const TESTNET_ASSETS = {
  quoteType:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  defaultCollateralType:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
} as const;

/** dUSDC / USD Pyth price feed on testnet (same as app `pythQuoteOracleId`). */
export const TESTNET_PYTH_QUOTE_ORACLE_ID =
  '0x9c4dd4008297ffa5e480684b8100ec21cc934405ed9a25d4e4d7b6259aad9c81';

/** Quote Pyth oracle + default collateral liquidation wiring (fill after deploy). */
export const TESTNET_LIQUIDATION = {
  spotPoolId: '',
  pythCollateralOracleId: TESTNET_PYTH_QUOTE_ORACLE_ID,
  pythQuoteOracleId: TESTNET_PYTH_QUOTE_ORACLE_ID,
  deepCoinId: '',
} as const;

/** Extra quote borrowed on flash loans to cover accrued vault interest. */
export const FLASH_BORROW_BUFFER_BPS = 500;

/** Min quote-out slippage guard on liquidation spot swaps. */
export const LIQUIDATION_SWAP_SLIPPAGE_BPS = 300;

/** Slippage floor on keeper trigger redeems (matches app `DEFAULT_SLIPPAGE_BPS`). */
export const TRIGGER_REDEEM_SLIPPAGE_BPS = 500;

/** Predict per-contract premium scale (1e9). */
export const PREDICT_PRICE_SCALE = 1_000_000_000n;

/**
 * Launch collateral targets — on-chain LTV via `whitelist_collateral_entry`.
 * Canonical max / liquidation bps: dUSDC 9000/9500.
 */
export const LAUNCH_COLLATERAL_CATALOG: CollateralCatalogEntry[] = [
  {
    symbol: 'DUSDC',
    coinType: TESTNET_ASSETS.quoteType,
    maxLtvBps: 9000,
    liquidationLtvBps: 9500,
    pythOracleId: TESTNET_PYTH_QUOTE_ORACLE_ID,
    spotPoolId: '',
    deepCoinId: '',
  },
];

export const KEEPER_ENABLED = true;

export const DEFAULT_SUI_NETWORK = 'testnet' as const;

export const SUI_RPC_URLS: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
};

/** leverx-server URL (same host when running leverx stack). */
export const INDEXER_URL = 'http://127.0.0.1:3100';

export const DEFAULT_PORT = 3001;

export const KEEPER_CRON_DEFAULTS = {
  settlement: '*/5 * * * *',
  limitOrder: '*/1 * * * *',
  liquidation: '*/2 * * * *',
  trigger: '*/1 * * * *',
} as const;

export const KEEPER_LIMIT_DEFAULTS = {
  settlements: 10,
  limitFills: 10,
  liquidations: 5,
  triggers: 10,
} as const;
