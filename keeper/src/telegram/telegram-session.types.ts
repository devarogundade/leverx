export type TelegramTradingSession = {
  chat_id: string;
  account_id: string;
  owner: string;
  expires_at_ms: number;
  created_at_ms: number;
  active_oracle_id: string | null;
  telegram_username: string | null;
};

export type TelegramMarketsListEntry = {
  index: number;
  oracle_id: string;
  label: string;
  underlying: string;
  expiry_ms: number;
  max_leverage_for_time?: number;
};

export type TelegramOtpResponse = {
  code: string;
  expires_at_ms: number;
};

export type TelegramSessionStatus = {
  enabled: boolean;
  bot_username: string | null;
  active: boolean;
  expires_at_ms: number | null;
  chat_id: string | null;
  telegram_username: string | null;
  active_oracle_id: string | null;
};

export type PredictOracleRow = {
  oracle_id: string;
  underlying_asset?: string;
  expiry?: number;
  status?: string;
  min_strike?: number;
  tick_size?: number;
};

export type PredictOracleState = {
  spot_price?: number;
  status?: string;
  is_settled?: boolean;
  min_strike?: number;
  tick_size?: number;
  expiry?: number;
};
