export const TRADE_MINT_MESSAGE_PREFIX = 'leverx:trade:mint:v1';
export const TRADE_REDEEM_MESSAGE_PREFIX = 'leverx:trade:redeem:v1';
export const TRADE_SETTLE_MESSAGE_PREFIX = 'leverx:trade:settle:v1';

export type MintOrderKind = 'market' | 'limit';
export type RedeemMode = 'market' | 'limit';

/** Max lifetime from signing time to expiry embedded in the message. */
export const TRADE_MAX_TTL_MS = 5 * 60_000;

/** Allow wallets slightly ahead of keeper clock. */
export const TRADE_CLOCK_SKEW_MS = 30_000;

export type MarketKeyFields = {
  oracleId: string;
  expiryMs: number;
  strike: number;
  higherStrike: number;
  isUp: boolean;
  isRange: boolean;
};

export type MintIntentFields = MarketKeyFields & {
  address: string;
  accountId: string;
  predictManagerId: string;
  expiresAtMs: number;
  marginQuoteAtoms: bigint;
  leverageBps: bigint;
  quantity: bigint;
  maxMintCost: bigint;
  marketSlippageBps: number;
  remintAfterDeleverage: boolean;
  /** `market` immediate fill or `limit` immediate marketable-limit fill. */
  orderKind: MintOrderKind;
  /** Limit premium (raw per-unit) — only used when `orderKind === 'limit'`. */
  limitPremiumPerUnit: bigint;
  /** Placement slippage bps — only used when `orderKind === 'limit'`. */
  placementSlippageBps: number;
};

export type RedeemIntentFields = MarketKeyFields & {
  address: string;
  accountId: string;
  predictManagerId: string;
  expiresAtMs: number;
  quantity: bigint;
  minPayout: bigint;
  /** `market` redeem or `limit` (marketable) redeem. */
  redeemMode: RedeemMode;
  /** Minimum premium per unit — only used when `redeemMode === 'limit'`. */
  minPremiumPerUnit: bigint;
};

export type SettleIntentFields = MarketKeyFields & {
  address: string;
  accountId: string;
  predictManagerId: string;
  expiresAtMs: number;
  quantity: bigint;
};

function encodeBool(value: boolean): string {
  return value ? 'true' : 'false';
}

function parseBool(value: string | undefined): boolean {
  return value === 'true';
}

function parseKeyValueMessage(
  bytes: Uint8Array,
  expectedPrefix: string,
): Record<string, string> {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split('\n');
  if (lines[0] !== expectedPrefix) {
    throw new Error('invalid_message_prefix');
  }

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return fields;
}

function parseAddressField(fields: Record<string, string>, key: string): string {
  const value = fields[key]?.trim().toLowerCase();
  if (!value || !/^0x[a-f0-9]{64}$/.test(value)) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

function parseU64Field(fields: Record<string, string>, key: string): bigint {
  const raw = fields[key];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(`invalid_${key}`);
  }
  return BigInt(raw);
}

function parseNumberField(fields: Record<string, string>, key: string): number {
  const raw = fields[key];
  const value = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`invalid_${key}`);
  }
  return value;
}

/** Optional u64 — defaults to 0 when absent (backwards compatible). */
function parseOptionalU64(fields: Record<string, string>, key: string): bigint {
  const raw = fields[key];
  if (raw === undefined || raw === '') return 0n;
  if (!/^\d+$/.test(raw)) throw new Error(`invalid_${key}`);
  return BigInt(raw);
}

/** Optional non-negative integer — defaults to 0 when absent. */
function parseOptionalNumber(
  fields: Record<string, string>,
  key: string,
): number {
  const raw = fields[key];
  if (raw === undefined || raw === '') return 0;
  return parseNumberField(fields, key);
}

function parseMintOrderKind(fields: Record<string, string>): MintOrderKind {
  return fields.order_kind === 'limit' ? 'limit' : 'market';
}

function parseRedeemMode(fields: Record<string, string>): RedeemMode {
  return fields.redeem_mode === 'limit' ? 'limit' : 'market';
}

function parseMarketKeyFields(fields: Record<string, string>): MarketKeyFields {
  return {
    oracleId: parseAddressField(fields, 'oracle_id'),
    expiryMs: Number(parseU64Field(fields, 'market_expiry_ms')),
    strike: Number(parseU64Field(fields, 'strike')),
    higherStrike: Number(parseU64Field(fields, 'higher_strike')),
    isUp: parseBool(fields.is_up),
    isRange: parseBool(fields.is_range),
  };
}

export function buildMintIntentMessage(fields: MintIntentFields): Uint8Array {
  const lines = [
    TRADE_MINT_MESSAGE_PREFIX,
    `address=${fields.address.trim().toLowerCase()}`,
    `account_id=${fields.accountId.trim().toLowerCase()}`,
    `predict_manager_id=${fields.predictManagerId.trim().toLowerCase()}`,
    `expires_ms=${fields.expiresAtMs}`,
    `oracle_id=${fields.oracleId.trim().toLowerCase()}`,
    `market_expiry_ms=${fields.expiryMs}`,
    `strike=${fields.strike}`,
    `higher_strike=${fields.higherStrike}`,
    `is_up=${encodeBool(fields.isUp)}`,
    `is_range=${encodeBool(fields.isRange)}`,
    `margin_quote_atoms=${fields.marginQuoteAtoms.toString()}`,
    `leverage_bps=${fields.leverageBps.toString()}`,
    `quantity=${fields.quantity.toString()}`,
    `max_mint_cost=${fields.maxMintCost.toString()}`,
    `market_slippage_bps=${fields.marketSlippageBps}`,
    `remint_after_deleverage=${encodeBool(fields.remintAfterDeleverage)}`,
    `order_kind=${fields.orderKind}`,
    `limit_premium_per_unit=${fields.limitPremiumPerUnit.toString()}`,
    `placement_slippage_bps=${fields.placementSlippageBps}`,
  ];
  return new TextEncoder().encode(lines.join('\n'));
}

export function parseMintIntentMessage(bytes: Uint8Array): MintIntentFields {
  const fields = parseKeyValueMessage(bytes, TRADE_MINT_MESSAGE_PREFIX);
  const expiresAtMs = parseNumberField(fields, 'expires_ms');
  const key = parseMarketKeyFields(fields);

  return {
    ...key,
    address: parseAddressField(fields, 'address'),
    accountId: parseAddressField(fields, 'account_id'),
    predictManagerId: parseAddressField(fields, 'predict_manager_id'),
    expiresAtMs,
    marginQuoteAtoms: parseU64Field(fields, 'margin_quote_atoms'),
    leverageBps: parseU64Field(fields, 'leverage_bps'),
    quantity: parseU64Field(fields, 'quantity'),
    maxMintCost: parseU64Field(fields, 'max_mint_cost'),
    marketSlippageBps: parseNumberField(fields, 'market_slippage_bps'),
    remintAfterDeleverage: parseBool(fields.remint_after_deleverage),
    orderKind: parseMintOrderKind(fields),
    limitPremiumPerUnit: parseOptionalU64(fields, 'limit_premium_per_unit'),
    placementSlippageBps: parseOptionalNumber(fields, 'placement_slippage_bps'),
  };
}

export function buildRedeemIntentMessage(fields: RedeemIntentFields): Uint8Array {
  const lines = [
    TRADE_REDEEM_MESSAGE_PREFIX,
    `address=${fields.address.trim().toLowerCase()}`,
    `account_id=${fields.accountId.trim().toLowerCase()}`,
    `predict_manager_id=${fields.predictManagerId.trim().toLowerCase()}`,
    `expires_ms=${fields.expiresAtMs}`,
    `oracle_id=${fields.oracleId.trim().toLowerCase()}`,
    `market_expiry_ms=${fields.expiryMs}`,
    `strike=${fields.strike}`,
    `higher_strike=${fields.higherStrike}`,
    `is_up=${encodeBool(fields.isUp)}`,
    `is_range=${encodeBool(fields.isRange)}`,
    `quantity=${fields.quantity.toString()}`,
    `min_payout=${fields.minPayout.toString()}`,
    `redeem_mode=${fields.redeemMode}`,
    `min_premium_per_unit=${fields.minPremiumPerUnit.toString()}`,
  ];
  return new TextEncoder().encode(lines.join('\n'));
}

export function parseRedeemIntentMessage(bytes: Uint8Array): RedeemIntentFields {
  const fields = parseKeyValueMessage(bytes, TRADE_REDEEM_MESSAGE_PREFIX);
  const expiresAtMs = parseNumberField(fields, 'expires_ms');
  const key = parseMarketKeyFields(fields);

  return {
    ...key,
    address: parseAddressField(fields, 'address'),
    accountId: parseAddressField(fields, 'account_id'),
    predictManagerId: parseAddressField(fields, 'predict_manager_id'),
    expiresAtMs,
    quantity: parseU64Field(fields, 'quantity'),
    minPayout: parseU64Field(fields, 'min_payout'),
    redeemMode: parseRedeemMode(fields),
    minPremiumPerUnit: parseOptionalU64(fields, 'min_premium_per_unit'),
  };
}

export function buildSettleIntentMessage(fields: SettleIntentFields): Uint8Array {
  const lines = [
    TRADE_SETTLE_MESSAGE_PREFIX,
    `address=${fields.address.trim().toLowerCase()}`,
    `account_id=${fields.accountId.trim().toLowerCase()}`,
    `predict_manager_id=${fields.predictManagerId.trim().toLowerCase()}`,
    `expires_ms=${fields.expiresAtMs}`,
    `oracle_id=${fields.oracleId.trim().toLowerCase()}`,
    `market_expiry_ms=${fields.expiryMs}`,
    `strike=${fields.strike}`,
    `higher_strike=${fields.higherStrike}`,
    `is_up=${encodeBool(fields.isUp)}`,
    `is_range=${encodeBool(fields.isRange)}`,
    `quantity=${fields.quantity.toString()}`,
  ];
  return new TextEncoder().encode(lines.join('\n'));
}

export function parseSettleIntentMessage(bytes: Uint8Array): SettleIntentFields {
  const fields = parseKeyValueMessage(bytes, TRADE_SETTLE_MESSAGE_PREFIX);
  const expiresAtMs = parseNumberField(fields, 'expires_ms');
  const key = parseMarketKeyFields(fields);

  return {
    ...key,
    address: parseAddressField(fields, 'address'),
    accountId: parseAddressField(fields, 'account_id'),
    predictManagerId: parseAddressField(fields, 'predict_manager_id'),
    expiresAtMs,
    quantity: parseU64Field(fields, 'quantity'),
  };
}

export function assertTradeIntentExpiry(
  expiresAtMs: number,
  nowMs = Date.now(),
): void {
  if (expiresAtMs < nowMs - TRADE_CLOCK_SKEW_MS) {
    throw new Error('message_expired');
  }
  if (expiresAtMs > nowMs + TRADE_MAX_TTL_MS + TRADE_CLOCK_SKEW_MS) {
    throw new Error('message_expiry_too_far');
  }
}
