export type TelegramSubscription = {
  chat_id: string;
  account_id: string;
  owner: string;
  subscribed_at_ms: number;
  telegram_username?: string | null;
};

export type TelegramLinkToken = {
  token: string;
  account_id: string;
  owner: string;
  expires_at_ms: number;
};

export type TelegramLinkTokenResponse = {
  bot_username: string;
  start_payload: string;
  deep_link: string;
  expires_at_ms: number;
};

export type TelegramSubscriptionStatus = {
  enabled: boolean;
  bot_username: string | null;
  subscribed: boolean;
  subscriptions: TelegramSubscription[];
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; username?: string };
    text?: string;
    from?: { id: number; username?: string; first_name?: string };
  };
};
