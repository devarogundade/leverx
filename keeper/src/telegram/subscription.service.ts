import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { TelegramAlertSentEntity } from '../database/entities/telegram-alert-sent.entity';
import { TelegramLinkTokenEntity } from '../database/entities/telegram-link-token.entity';
import { TelegramSubscriptionEntity } from '../database/entities/telegram-subscription.entity';
import type { TelegramLinkToken, TelegramSubscription } from './telegram.types';

const OBJECT_ID_RE = /^0x[a-f0-9]{64}$/;

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(TelegramSubscriptionEntity)
    private readonly subscriptions: Repository<TelegramSubscriptionEntity>,
    @InjectRepository(TelegramLinkTokenEntity)
    private readonly linkTokens: Repository<TelegramLinkTokenEntity>,
    @InjectRepository(TelegramAlertSentEntity)
    private readonly alertSent: Repository<TelegramAlertSentEntity>,
  ) {}

  async createLinkToken(
    owner: string,
    accountId: string,
    linkTokenTtlMs: number,
  ): Promise<TelegramLinkToken> {
    await this.pruneExpiredTokens();
    const token = randomBytes(16).toString('hex');
    const row = this.linkTokens.create({
      token,
      account_id: normalizeId(accountId),
      owner: normalizeAddress(owner),
      expires_at_ms: String(Date.now() + linkTokenTtlMs),
    });
    await this.linkTokens.save(row);
    return toLinkToken(row);
  }

  async consumeLinkToken(token: string): Promise<TelegramLinkToken | null> {
    await this.pruneExpiredTokens();
    const normalized = token.trim().toLowerCase();
    const row = await this.linkTokens.findOne({ where: { token: normalized } });
    if (!row) return null;
    if (Number(row.expires_at_ms) <= Date.now()) {
      await this.linkTokens.delete({ token: normalized });
      return null;
    }
    await this.linkTokens.delete({ token: normalized });
    return toLinkToken(row);
  }

  async addSubscription(
    chatId: string,
    accountId: string,
    owner: string,
    telegramUsername?: string | null,
  ): Promise<TelegramSubscription> {
    const row: TelegramSubscription = {
      chat_id: chatId,
      account_id: normalizeId(accountId),
      owner: normalizeAddress(owner),
      subscribed_at_ms: Date.now(),
      telegram_username: telegramUsername?.trim() || null,
    };
    await this.subscriptions.upsert(
      {
        chat_id: row.chat_id,
        account_id: row.account_id,
        owner: row.owner,
        subscribed_at_ms: String(row.subscribed_at_ms),
        telegram_username: row.telegram_username,
      },
      ['chat_id', 'account_id'],
    );
    return row;
  }

  async removeAllForChat(chatId: string): Promise<number> {
    const result = await this.subscriptions.delete({ chat_id: chatId });
    return result.affected ?? 0;
  }

  async getChatIdsForAccount(accountId: string): Promise<string[]> {
    const rows = await this.subscriptions.find({
      where: { account_id: normalizeId(accountId) },
    });
    return [...new Set(rows.map((row) => row.chat_id))];
  }

  async listForAccount(accountId: string): Promise<TelegramSubscription[]> {
    const rows = await this.subscriptions.find({
      where: { account_id: normalizeId(accountId) },
      order: { subscribed_at_ms: 'DESC' },
    });
    return rows.map(toSubscription);
  }

  async listForChat(chatId: string): Promise<TelegramSubscription[]> {
    const rows = await this.subscriptions.find({
      where: { chat_id: chatId },
      order: { subscribed_at_ms: 'DESC' },
    });
    return rows.map(toSubscription);
  }

  async subscribedAccountIds(): Promise<string[]> {
    const rows = await this.subscriptions
      .createQueryBuilder('sub')
      .select('DISTINCT sub.account_id', 'account_id')
      .getRawMany<{ account_id: string }>();
    return rows.map((row) => row.account_id);
  }

  async shouldSendAlert(alertKey: string, cooldownMs: number): Promise<boolean> {
    const row = await this.alertSent.findOne({ where: { alert_key: alertKey } });
    const last = row ? Number(row.sent_at_ms) : 0;
    return Date.now() - last >= cooldownMs;
  }

  async markAlertSent(alertKey: string): Promise<void> {
    await this.alertSent.save(
      this.alertSent.create({
        alert_key: alertKey,
        sent_at_ms: String(Date.now()),
      }),
    );
  }

  private async pruneExpiredTokens(): Promise<void> {
    await this.linkTokens.delete({
      expires_at_ms: LessThan(String(Date.now())),
    });
  }
}

function toSubscription(row: TelegramSubscriptionEntity): TelegramSubscription {
  return {
    chat_id: row.chat_id,
    account_id: row.account_id,
    owner: row.owner,
    subscribed_at_ms: Number(row.subscribed_at_ms),
    telegram_username: row.telegram_username,
  };
}

function toLinkToken(row: TelegramLinkTokenEntity): TelegramLinkToken {
  return {
    token: row.token,
    account_id: row.account_id,
    owner: row.owner,
    expires_at_ms: Number(row.expires_at_ms),
  };
}

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
