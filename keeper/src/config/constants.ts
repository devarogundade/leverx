/**
 * Keeper configuration — defaults mirror `contracts/deploy-testnet.env`.
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

/** Published LeverX package + shared objects (testnet). Mirrors `contracts/deploy-testnet.env`. */
export const TESTNET_LEVERX = {
  packageId:
    '0x972b59d3ee7c74a01d88d0b2d895d0f6ce58fc68fdead02c974ad824bfd6b790',
  registryId:
    '0xe7a1cc48e4073557ed6819a313ff1bbee4cafe50929712500782b1046660bbc0',
  vaultId: '0xed3e5aa7b6a148720ad4b9813eb621c6d2c14c45616b1fe11b88ee1cb057f907',
  feeCollectorId:
    '0x91fccb2929c76addfb958930901a81e59f6eff8309d6afe6c507261bbbd49468',
} as const;

/** dUSDC quote type on testnet. */
export const TESTNET_ASSETS = {
  quoteType:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
} as const;

/** Min/max leverage (basis points). */
export const MIN_LEVERAGE_BPS = 10_000;

/** Default final window at registry init (15 minutes). */
export const DEFAULT_FINAL_WINDOW_MS = 900_000;
/** Minimum admin-configurable final window (10 minutes). */
export const MIN_FINAL_WINDOW_MS = 600_000;
/** Maximum admin-configurable final window (4 hours). */
export const MAX_FINAL_WINDOW_MS = 14_400_000;

/** @deprecated Use on-chain `protocol_registry::final_window_ms`. */
export const LEVERAGED_MINT_WINDOW_MS = DEFAULT_FINAL_WINDOW_MS;
export const MAX_LEVERAGE_BPS = 100_000;

/** Default on-chain liquidation health threshold (105%). */
export const DEFAULT_LIQUIDATION_BPS = 10_500;

/** Maximum admin-configurable liquidation threshold (150%). */
export const MAX_LIQUIDATION_BPS = 15_000;

/** Margin-call threshold — matches `protocol_constants::default_liquidation_bps`. */
export const MARGIN_CALL_BPS = DEFAULT_LIQUIDATION_BPS;

/** Extra quote on vault flash loans (covers accrued interest + fees). Matches on-chain buffer. */
export const FLASH_BORROW_BUFFER_BPS = 500;

/** Default on-chain trigger redeem slippage when unset at placement. */
export const DEFAULT_TRIGGER_SLIPPAGE_BPS = 500;

/** Slippage floor on keeper trigger redeems when on-chain config is zero. */
export const TRIGGER_REDEEM_SLIPPAGE_BPS = DEFAULT_TRIGGER_SLIPPAGE_BPS;

/** Predict per-contract premium scale (1e9). */
export const PREDICT_PRICE_SCALE = 1_000_000_000n;

/**
 * Quantity for dev-inspect per-contract ask/bid reads.
 * qty=1 often rounds mint/redeem totals to 0 on Predict.
 */
export const PREDICT_QUOTE_REFERENCE_QUANTITY = 1_000_000n;

export const KEEPER_ENABLED = true;

export const DEFAULT_SUI_NETWORK = 'testnet' as const;

export const SUI_RPC_URLS: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
};

/** Public leverx-server (standalone keeper / Docker). Override for local stack. */
export const INDEXER_URL = 'https://indexer.suileverx.xyz';

/** Sender for read-only dev-inspect when the keeper signer is not configured. */
export const READONLY_DEVINSPECT_SENDER =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export const DEFAULT_PORT = 3001;

/** Every 20s, staggered by 2s so concurrent jobs do not pile up on the same tick. */
export const KEEPER_CRON_DEFAULTS = {
  limitOrder: '2,22,42 * * * * *',
  liquidation: '4,24,44 * * * * *',
  trigger: '6,26,46 * * * * *',
  forceClose: '8,28,48 * * * * *',
} as const;

export const KEEPER_LIMIT_DEFAULTS = {
  limitFills: 10,
  liquidations: 5,
  triggers: 10,
  forceCloses: 10,
} as const;
