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
    '0xa471ec72186fc00723d013fe0067ee829d28421dcf31f47e2413600cdbfb1467',
  registryId:
    '0x8d07198915b859fc89dcc62cb40752ba185364a8599cf472f29301e287256857',
  vaultId: '0x0c577c0de77aea7eaf1891d24476353efd74e85f865a0e02e5da54adde58c966',
  feeCollectorId:
    '0x63815d553d3db63bbbf3337fee23f4875feb1e91a2be2a2c31e22f52238181fa',
} as const;

/** Quote / default collateral coin types on testnet. */
export const TESTNET_ASSETS = {
  quoteType:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  defaultCollateralType: '0x2::sui::SUI',
} as const;

/** Quote Pyth oracle + default collateral liquidation wiring (fill after deploy). */
export const TESTNET_LIQUIDATION = {
  spotPoolId: '',
  pythCollateralOracleId: '',
  pythQuoteOracleId: '',
  deepCoinId: '',
} as const;

/** Extra quote borrowed on flash loans to cover accrued vault interest. */
export const FLASH_BORROW_BUFFER_BPS = 500;

/** Min quote-out slippage guard on liquidation spot swaps. */
export const LIQUIDATION_SWAP_SLIPPAGE_BPS = 300;

/**
 * Launch collateral targets — on-chain LTV via `whitelist_collateral_entry`.
 * Canonical max / liquidation bps: dUSDC 9000/9500, SUI 8000/9500, DEEP 7000/9500.
 * Fill `coinType` / oracle / pool IDs after deploy.
 */
export const LAUNCH_COLLATERAL_CATALOG: CollateralCatalogEntry[] = [
  {
    symbol: 'SUI',
    coinType: '0x2::sui::SUI',
    maxLtvBps: 8000,
    liquidationLtvBps: 9500,
    pythOracleId:
      '0x1ebb295c789cc42b3b2a1606482cd1c7124076a0f5676718501fda8c7fd075a0',
    spotPoolId: '', // pending DeepBook SUI/dUSDC pool
    deepCoinId: '',
  },
  {
    symbol: 'DUSDC',
    coinType: TESTNET_ASSETS.quoteType,
    maxLtvBps: 9000,
    liquidationLtvBps: 9500,
    pythOracleId:
      '0x9c4dd4008297ffa5e480684b8100ec21cc934405ed9a25d4e4d7b6259aad9c81',
    spotPoolId: '',
    deepCoinId: '',
  },
  {
    symbol: 'DEEP',
    coinType:
      '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
    maxLtvBps: 7000,
    liquidationLtvBps: 9500,
    pythOracleId:
      '0x3d52fffa2cd9e54b39bb36d282bdda560b15b8b4fdf4766a3c58499ef172bafc',
    spotPoolId: '', // pending DeepBook DEEP/dUSDC pool
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
