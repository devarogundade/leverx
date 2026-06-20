import type { AppAuthPayload, AppAuthResponse } from '../auth/app-auth.types';

export type TradeRelayResponse = {
  digest: string;
  auth?: AppAuthResponse;
};

export type MintTradeBody = AppAuthPayload;

export type RedeemTradeBody = AppAuthPayload;

export type SettleTradeBody = AppAuthPayload;

export type RecoverManagerTradeBody = AppAuthPayload;
