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

/** Published LeverX package + shared objects (fill after `deploy_and_share`). */
export const TESTNET_LEVERX = {
  packageId:
    '0xfe042fb234a20c8599227bec8cf17ace8bf21276c0f499d23f075425cd7973f2',
  registryId: '',
  vaultId: '',
  feeCollectorId: '',
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
 * Fill `coinType` / oracle / pool IDs after deploy.
 */
export const LAUNCH_COLLATERAL_CATALOG: CollateralCatalogEntry[] = [
  {
    symbol: 'BTC',
    coinType: '',
    maxLtvBps: 8000,
    liquidationLtvBps: 8500,
    pythOracleId: '',
    spotPoolId: '',
    deepCoinId: '',
  },
  {
    symbol: 'SUI',
    coinType: '0x2::sui::SUI',
    maxLtvBps: 7000,
    liquidationLtvBps: 7500,
    pythOracleId: '',
    spotPoolId: '',
    deepCoinId: '',
  },
  {
    symbol: 'DUSDC',
    coinType: TESTNET_ASSETS.quoteType,
    maxLtvBps: 10000,
    liquidationLtvBps: 10000,
    pythOracleId: '',
    spotPoolId: '',
    deepCoinId: '',
  },
  {
    symbol: 'DEEP',
    coinType: '',
    maxLtvBps: 6000,
    liquidationLtvBps: 6500,
    pythOracleId: '',
    spotPoolId: '',
    deepCoinId: '',
  },
];

export const KEEPER_ENABLED = true;

export const DEFAULT_SUI_NETWORK = 'testnet' as const;

export const SUI_RPC_URLS: Record<string, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
};

/** leverx-server URL (same host when running shieldbook stack). */
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
