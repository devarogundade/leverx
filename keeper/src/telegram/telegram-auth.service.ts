import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import type { RedisConfig } from '../config/redis.config';
import type { TelegramConfig } from '../config/telegram.config';
import type {
  TelegramOtpResponse,
  TelegramSessionStatus,
  TelegramTradingSession,
} from './telegram-session.types';

const OTP_PREFIX = 'leverx:telegram:otp:';
const SESSION_PREFIX = 'leverx:telegram:session:';
const ACCOUNT_CHATS_PREFIX = 'leverx:telegram:account-chats:';

type OtpPayload = {
  account_id: string;
  owner: string;
  expires_at_ms: number;
};

@Injectable()
export class TelegramAuthService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramAuthService.name);
  private readonly redis: Redis;
  private readonly cfg: TelegramConfig;

  constructor(config: ConfigService) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
    const redisCfg = config.get<RedisConfig>('redis')!;
    this.redis = new Redis(redisCfg.connection as unknown as RedisOptions);
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis telegram auth error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async createOtp(accountId: string, owner: string): Promise<TelegramOtpResponse> {
    const normalizedAccount = normalizeId(accountId);
    const normalizedOwner = normalizeAddress(owner);
    const expiresAtMs = Date.now() + this.cfg.otpTtlMs;
    const ttlSec = Math.max(1, Math.ceil(this.cfg.otpTtlMs / 1000));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateOtpCode();
      const key = `${OTP_PREFIX}${code}`;
      const inserted = await this.redis.set(
        key,
        JSON.stringify({
          account_id: normalizedAccount,
          owner: normalizedOwner,
          expires_at_ms: expiresAtMs,
        } satisfies OtpPayload),
        'EX',
        ttlSec,
        'NX',
      );
      if (inserted === 'OK') {
        return { code, expires_at_ms: expiresAtMs };
      }
    }
    throw new Error('otp_generation_failed');
  }

  async verifyOtpAndCreateSession(
    chatId: string,
    code: string,
    telegramUsername: string | null,
  ): Promise<TelegramTradingSession | null> {
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) return null;

    const key = `${OTP_PREFIX}${normalizedCode}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;

    await this.redis.del(key);
    let payload: OtpPayload;
    try {
      payload = JSON.parse(raw) as OtpPayload;
    } catch {
      return null;
    }
    if (payload.expires_at_ms <= Date.now()) return null;

    return this.createSession(
      chatId,
      payload.account_id,
      payload.owner,
      telegramUsername,
    );
  }

  async createSession(
    chatId: string,
    accountId: string,
    owner: string,
    telegramUsername: string | null,
  ): Promise<TelegramTradingSession> {
    const now = Date.now();
    const session: TelegramTradingSession = {
      chat_id: chatId,
      account_id: normalizeId(accountId),
      owner: normalizeAddress(owner),
      expires_at_ms: now + this.cfg.sessionTtlMs,
      created_at_ms: now,
      active_oracle_id: null,
      telegram_username: telegramUsername,
    };

    const ttlSec = Math.max(1, Math.ceil(this.cfg.sessionTtlMs / 1000));
    await this.redis.set(
      `${SESSION_PREFIX}${chatId}`,
      JSON.stringify(session),
      'EX',
      ttlSec,
    );
    await this.redis.sadd(`${ACCOUNT_CHATS_PREFIX}${session.account_id}`, chatId);
    return session;
  }

  async getSession(chatId: string): Promise<TelegramTradingSession | null> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${chatId}`);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as TelegramTradingSession;
      if (session.expires_at_ms <= Date.now()) {
        await this.revokeSession(chatId);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  async touchSession(chatId: string, session: TelegramTradingSession): Promise<void> {
    session.expires_at_ms = Date.now() + this.cfg.sessionTtlMs;
    const ttlSec = Math.max(1, Math.ceil(this.cfg.sessionTtlMs / 1000));
    await this.redis.set(
      `${SESSION_PREFIX}${chatId}`,
      JSON.stringify(session),
      'EX',
      ttlSec,
    );
  }

  async setActiveOracle(chatId: string, oracleId: string): Promise<TelegramTradingSession | null> {
    const session = await this.getSession(chatId);
    if (!session) return null;
    session.active_oracle_id = normalizeId(oracleId);
    await this.touchSession(chatId, session);
    return session;
  }

  async getSessionStatusForAccount(
    accountId: string,
    botUsername: string | null,
    enabled: boolean,
  ): Promise<TelegramSessionStatus> {
    const chatIds = await this.redis.smembers(`${ACCOUNT_CHATS_PREFIX}${normalizeId(accountId)}`);
    for (const chatId of chatIds) {
      const session = await this.getSession(chatId);
      if (session) {
        return {
          enabled,
          bot_username: botUsername,
          active: true,
          expires_at_ms: session.expires_at_ms,
          chat_id: session.chat_id,
          telegram_username: session.telegram_username,
          active_oracle_id: session.active_oracle_id,
        };
      }
    }
    return {
      enabled,
      bot_username: botUsername,
      active: false,
      expires_at_ms: null,
      chat_id: null,
      telegram_username: null,
      active_oracle_id: null,
    };
  }

  async revokeSessionsForAccount(accountId: string): Promise<number> {
    const normalized = normalizeId(accountId);
    const chatIds = await this.redis.smembers(`${ACCOUNT_CHATS_PREFIX}${normalized}`);
    if (chatIds.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    for (const chatId of chatIds) {
      pipeline.del(`${SESSION_PREFIX}${chatId}`);
    }
    pipeline.del(`${ACCOUNT_CHATS_PREFIX}${normalized}`);
    await pipeline.exec();
    return chatIds.length;
  }

  async revokeSession(chatId: string): Promise<void> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${chatId}`);
    if (!raw) return;
    try {
      const session = JSON.parse(raw) as TelegramTradingSession;
      await this.redis.del(`${SESSION_PREFIX}${chatId}`);
      await this.redis.srem(`${ACCOUNT_CHATS_PREFIX}${session.account_id}`, chatId);
    } catch {
      await this.redis.del(`${SESSION_PREFIX}${chatId}`);
    }
  }
}

function generateOtpCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

const OBJECT_ID_RE = /^0x[a-f0-9]{64}$/;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function normalizeId(id: string): string {
  const normalized = id.trim().toLowerCase();
  if (!OBJECT_ID_RE.test(normalized)) {
    throw new Error('invalid_object_id');
  }
  return normalized;
}
