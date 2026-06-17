import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramConfig } from '../config/telegram.config';
import { IndexerService } from '../indexer/indexer.service';
import { logKeeperError, logKeeperWarn } from '../lib/keeper-log';
import { TelegramAuthService } from './telegram-auth.service';
import { SubscriptionService } from './subscription.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramCommandService } from './telegram-command.service';
import type {
  TelegramLinkTokenResponse,
  TelegramOtpResponse,
  TelegramSessionStatus,
  TelegramSubscriptionStatus,
  TelegramUpdate,
} from './telegram.types';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly cfg: TelegramConfig;
  private polling = false;
  private pollOffset = 0;

  constructor(
    config: ConfigService,
    private readonly indexer: IndexerService,
    private readonly api: TelegramApiService,
    private readonly subscriptions: SubscriptionService,
    private readonly commands: TelegramCommandService,
    private readonly auth: TelegramAuthService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isOperational() || !this.cfg.polling) return;

    await this.api.deleteWebhook(this.cfg.botToken);
    this.polling = true;
    void this.pollLoop();
    this.logger.log(
      `Telegram bot polling started (interval=${this.cfg.pollIntervalSec}s)`,
    );
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

  async createTradingOtp(owner: string, accountId: string): Promise<TelegramOtpResponse> {
    if (!this.isOperational()) {
      throw new ServiceUnavailableException('telegram_not_configured');
    }
    if (!(await this.verifyAccountOwner(owner, accountId))) {
      throw new ForbiddenException('account_not_owned');
    }
    return this.auth.createOtp(accountId, owner);
  }

  async getTradingSessionStatus(
    owner: string,
    accountId: string,
  ): Promise<TelegramSessionStatus> {
    if (!(await this.verifyAccountOwner(owner, accountId))) {
      throw new ForbiddenException('account_not_owned');
    }
    return this.auth.getSessionStatusForAccount(
      accountId,
      this.getBotUsername(),
      this.isOperational(),
    );
  }

  async revokeTradingSession(owner: string, accountId: string): Promise<{ revoked: number }> {
    if (!this.isOperational()) {
      throw new ServiceUnavailableException('telegram_not_configured');
    }
    if (!(await this.verifyAccountOwner(owner, accountId))) {
      throw new ForbiddenException('account_not_owned');
    }
    const revoked = await this.auth.revokeSessionsForAccount(accountId);
    return { revoked };
  }

  /** Handle Telegram webhook updates when `TELEGRAM_POLLING=false`. */
  async handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
    if (!this.isOperational() || this.cfg.polling) return;
    await this.processUpdate(update);
  }

  private async pollLoop(): Promise<void> {
    const timeoutSec = this.cfg.pollIntervalSec;
    const retryMs = timeoutSec * 1_000;

    while (this.polling) {
      try {
        const { updates, nextOffset } = await this.api.getUpdates(
          this.cfg.botToken,
          this.pollOffset,
          timeoutSec,
        );
        this.pollOffset = nextOffset;
        for (const raw of updates) {
          await this.processUpdate(raw as TelegramUpdate);
        }
      } catch (err) {
        logKeeperWarn(this.logger, 'telegram poll failed', err);
        await sleep(retryMs);
      }
    }
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const cq = update.callback_query;
    if (cq?.data && cq.message?.chat?.id != null) {
      const chatId = String(cq.message.chat.id);
      const username = cq.from?.username ?? null;
      try {
        await this.commands.handleCallback(chatId, cq.data, username);
      } catch (err) {
        logKeeperError(this.logger, `telegram callback failed for ${chatId}`, err);
      } finally {
        await this.api.answerCallbackQuery(this.cfg.botToken, cq.id).catch(() => {});
      }
      return;
    }

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
          'No alert subscriptions yet. Connect from the LeverX portfolio page, then tap Start in this chat.',
        );
        return;
      }
      const lines = subs.map(
        (row) => `• ${shortId(row.account_id)} (since ${formatDate(row.subscribed_at_ms)})`,
      );
      await this.api.sendMessage(
        this.cfg.botToken,
        chatId,
        `Alert subscriptions:\n${lines.join('\n')}\n\nSend /stop to unsubscribe all.`,
      );
      return;
    }

    try {
      await this.commands.handleMessage(chatId, text, username);
    } catch (err) {
      logKeeperError(this.logger, `telegram command failed for ${chatId}`, err);
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
        'LeverX Telegram bot',
        '',
        'Alerts: connect from the LeverX portfolio and tap Start.',
        'Trading: generate a code in the app, then /auth <code> here.',
        '',
        'Send /help for trading commands.',
        '/status — alert subscriptions',
        '/stop — unsubscribe alerts',
      ].join('\n'),
      { reply_markup: mainMenuKeyboard() },
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mainMenuKeyboard(): {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
} {
  return {
    inline_keyboard: [
      [
        { text: 'Do Markets', callback_data: 'do:markets' },
        { text: 'Do Balance', callback_data: 'do:balance' },
      ],
      [
        { text: 'Do Session', callback_data: 'do:session' },
        { text: 'Do Help', callback_data: 'do:help' },
      ],
    ],
  };
}
