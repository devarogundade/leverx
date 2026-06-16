import type { SignedTradeIntentPayload } from './trade-auth';

export type TradeRelayResponse = {
  digest: string;
};

export type MintTradeBody = SignedTradeIntentPayload;

export type RedeemTradeBody = SignedTradeIntentPayload;

export type SettleTradeBody = SignedTradeIntentPayload;
