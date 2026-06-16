import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramConfig } from '../config/telegram.config';
import { IndexerService } from '../indexer/indexer.service';
import { logKeeperError } from '../lib/keeper-log';
import { SubscriptionService } from './subscription.service';
import { TelegramApiService } from './telegram-api.service';
import type {
  TelegramLinkTokenResponse,
  TelegramSubscriptionStatus,
  TelegramUpdate,
} from './telegram.types';

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly cfg: TelegramConfig;

  constructor(
    config: ConfigService,
    private readonly indexer: IndexerService,
    private readonly api: TelegramApiService,
    private readonly subscriptions: SubscriptionService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  isEnabled(): boolean {
    return this.cfg.enabled;
  }

  isOperational(): boolean {
    return this.cfg.enabled && Boolean(this.cfg.botToken) && Boolean(this.cfg.botUsername);
  }

  getBotUsername(): string | null {
    return this.cfg.botUsername || null;
  }

  getSubscriptionService(): SubscriptionService {
    return this.subscriptions;
  }

  async createLinkToken(
    owner: string,
    accountId: string,
  ): Promise<TelegramLinkTokenResponse> {
    if (!this.isOperational()) {
      throw new ServiceUnavailableException('telegram_not_configured');
    }
    if (!(await this.verifyAccountOwner(owner, accountId))) {
      throw new ForbiddenException('account_not_owned');
    }

    const row = await this.subscriptions.createLinkToken(
      owner,
      accountId,
      this.cfg.linkTokenTtlMs,
    );
    const startPayload = `sub_${row.token}`;
    return {
      bot_username: this.cfg.botUsername,
      start_payload: startPayload,
      deep_link: `https://t.me/${this.cfg.botUsername}?start=${startPayload}`,
      expires_at_ms: row.expires_at_ms,
    };
  }

  async getSubscriptionStatus(
    owner: string,
    accountId: string,
  ): Promise<TelegramSubscriptionStatus> {
    if (!(await this.verifyAccountOwner(owner, accountId))) {
      throw new ForbiddenException('account_not_owned');
    }
    const rows = await this.subscriptions.listForAccount(accountId);
    return {
      enabled: this.isOperational(),
      bot_username: this.getBotUsername(),
      subscribed: rows.length > 0,
      subscriptions: rows,
    };
  }

  /** Handle Telegram webhook updates (`POST /telegram/webhook`). */
  async handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
    if (!this.isOperational()) return;
    await this.processUpdate(update);
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) return;

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const username = message.from?.username ?? null;

    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const payload = parts[1]?.trim();
      if (payload?.startsWith('sub_')) {
        await this.handleSubscribe(chatId, payload.slice(4), username);
        return;
      }
      await this.sendHelp(chatId);
      return;
    }

    if (text === '/stop' || text.startsWith('/stop@') || text === '/unsubscribe') {
      const removed = await this.subscriptions.removeAllForChat(chatId);
      await this.api.sendMessage(
        this.cfg.botToken,
        chatId,
        removed > 0
          ? `Unsubscribed from ${removed} trading account(s). You will no longer receive LeverX alerts here.`
          : 'You have no active LeverX subscriptions on this chat.',
      );
      return;
    }

    if (text === '/status') {
      const subs = await this.subscriptions.listForChat(chatId);
      if (subs.length === 0) {
        await this.api.sendMessage(
          this.cfg.botToken,
          chatId,
          'No subscriptions yet. Connect from the LeverX portfolio page, then tap Start in this chat.',
        );
        return;
      }
      const lines = subs.map(
        (row) => `• ${shortId(row.account_id)} (since ${formatDate(row.subscribed_at_ms)})`,
      );
      await this.api.sendMessage(
        this.cfg.botToken,
        chatId,
        `Active subscriptions:\n${lines.join('\n')}\n\nSend /stop to unsubscribe all.`,
      );
      return;
    }
  }

  private async handleSubscribe(
    chatId: string,
    token: string,
    username: string | null,
  ): Promise<void> {
    const link = await this.subscriptions.consumeLinkToken(token);
    if (!link) {
      await this.api.sendMessage(
        this.cfg.botToken,
        chatId,
        'This link expired or is invalid. Open the portfolio page in LeverX and tap Connect Telegram again.',
      );
      return;
    }

    await this.subscriptions.addSubscription(
      chatId,
      link.account_id,
      link.owner,
      username,
    );
    await this.api.sendMessage(
      this.cfg.botToken,
      chatId,
      [
        'You are subscribed to LeverX alerts for trading account',
        shortId(link.account_id),
        '.',
        '',
        'Notifications:',
        '• Limit order filled',
        '• Liquidation risk warning',
        '• Position liquidated',
        '',
        'Send /stop to unsubscribe or /status to list subscriptions.',
      ].join('\n'),
    );
  }

  private async sendHelp(chatId: string): Promise<void> {
    await this.api.sendMessage(
      this.cfg.botToken,
      chatId,
      [
        'LeverX trading alerts bot.',
        '',
        'To subscribe, open your portfolio on LeverX and tap Connect Telegram.',
        '',
        'Commands:',
        '/status — list subscriptions',
        '/stop — unsubscribe this chat',
      ].join('\n'),
    );
  }

  private async verifyAccountOwner(
    owner: string,
    accountId: string,
  ): Promise<boolean> {
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedAccount = accountId.trim().toLowerCase();
    if (!normalizedOwner || !normalizedAccount) return false;

    try {
      const { items } = await this.indexer.fetchAccounts({
        owner: normalizedOwner,
        accountId: normalizedAccount,
        limit: 5,
      });
      if (
        items.some(
          (row) => row.account_id.toLowerCase() === normalizedAccount,
        )
      ) {
        return true;
      }

      const detail = await this.indexer.fetchAccount(normalizedAccount);
      return detail.account?.owner?.toLowerCase() === normalizedOwner;
    } catch (err) {
      logKeeperError(this.logger, 'account ownership check failed', err);
      throw new BadRequestException('account_lookup_failed');
    }
  }
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
