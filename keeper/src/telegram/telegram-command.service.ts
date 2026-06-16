import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramConfig } from '../config/telegram.config';
import { TelegramApiService } from './telegram-api.service';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramMarketsService } from './telegram-markets.service';
import {
  TelegramTradeService,
  type TelegramTradeSide,
} from './telegram-trade.service';

@Injectable()
export class TelegramCommandService {
  private readonly logger = new Logger(TelegramCommandService.name);
  private readonly cfg: TelegramConfig;

  constructor(
    config: ConfigService,
    private readonly api: TelegramApiService,
    private readonly auth: TelegramAuthService,
    private readonly markets: TelegramMarketsService,
    private readonly trades: TelegramTradeService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  async handleMessage(
    chatId: string,
    text: string,
    username: string | null,
  ): Promise<void> {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('/auth')) {
      await this.handleAuth(chatId, trimmed, username);
      return;
    }
    if (/^\d{6}$/.test(trimmed)) {
      await this.handleAuth(chatId, `/auth ${trimmed}`, username);
      return;
    }
    if (lower === '/logout' || lower.startsWith('/logout@')) {
      await this.handleLogout(chatId);
      return;
    }
    if (lower === '/session' || lower.startsWith('/session@')) {
      await this.handleSession(chatId);
      return;
    }
    if (lower === '/markets' || lower.startsWith('/markets@')) {
      await this.handleMarkets(chatId);
      return;
    }
    if (lower.startsWith('/market')) {
      await this.handleMarket(chatId, trimmed);
      return;
    }
    if (lower === '/balance' || lower.startsWith('/balance@')) {
      await this.handleBalance(chatId);
      return;
    }
    if (lower === '/help' || lower.startsWith('/help@')) {
      await this.sendTradingHelp(chatId);
      return;
    }
    if (/^(?:\/up|\/down|\/range)(?:@\w+)?\s+/i.test(trimmed)) {
      await this.handleTrade(chatId, trimmed);
      return;
    }
    if (/^[1-9]$|^10$/.test(trimmed)) {
      await this.handleMarketNumber(chatId, trimmed);
      return;
    }
  }

  async sendTradingHelp(chatId: string): Promise<void> {
    await this.send(chatId, [
      'LeverX Telegram trading',
      '',
      '1. Generate a 6-digit code in the LeverX app (Portfolio → Telegram).',
      '2. Send /auth <code> here (or paste the code). Session lasts 7 days.',
      '3. Deposit dUSDC into your trading account on the web app first.',
      '4. Register the keeper as executor in Portfolio if prompted.',
      '',
      'Commands:',
      '/markets — list live markets',
      '/market <oracle_id> — select market',
      'Reply 1–10 after /markets to select',
      '/up <margin> <leverage> — e.g. /up 10 4x',
      '/down 10 2x',
      '/range 5 1x',
      '/balance — trading account balance',
      '/session — active session info',
      '/logout — end trading session',
      '',
      'Alerts (separate): /status, /stop',
    ].join('\n'));
  }

  private async handleAuth(
    chatId: string,
    text: string,
    username: string | null,
  ): Promise<void> {
    const parts = text.split(/\s+/);
    const code = parts[1]?.trim();
    if (!code) {
      await this.send(
        chatId,
        'Usage: /auth <6-digit-code>\nGenerate the code in LeverX → Portfolio → Telegram trading.',
      );
      return;
    }

    const session = await this.auth.verifyOtpAndCreateSession(chatId, code, username);
    if (!session) {
      await this.send(chatId, 'Invalid or expired code. Generate a new one in the LeverX app.');
      return;
    }

    await this.send(chatId, [
      'Trading session active',
      '',
      `Account: ${shortId(session.account_id)}`,
      `Expires: ${formatDate(session.expires_at_ms)}`,
      '',
      'Next steps:',
      '• Deposit dUSDC to your trading account on suileverx.xyz',
      '• Send /markets to pick a market',
      '• Trade with /up 10 4x (margin in dUSDC, leverage 1x–10x)',
      '',
      'Send /help for all commands.',
    ].join('\n'));
  }

  private async handleLogout(chatId: string): Promise<void> {
    await this.auth.revokeSession(chatId);
    await this.send(chatId, 'Trading session ended. Generate a new code in the app to reconnect.');
  }

  private async handleSession(chatId: string): Promise<void> {
    const session = await this.auth.getSession(chatId);
    if (!session) {
      await this.send(chatId, 'No active trading session. Use /auth with a code from the LeverX app.');
      return;
    }
    const lines = [
      'Trading session',
      '',
      `Account: ${shortId(session.account_id)}`,
      `Expires: ${formatDate(session.expires_at_ms)}`,
    ];
    if (session.active_oracle_id) {
      lines.push(`Market: ${shortId(session.active_oracle_id)}`);
    } else {
      lines.push('Market: not selected — send /markets');
    }
    await this.send(chatId, lines.join('\n'));
  }

  private async handleMarkets(chatId: string): Promise<void> {
    const session = await this.auth.getSession(chatId);
    if (!session) {
      await this.send(chatId, 'Authenticate first: /auth <code> from the LeverX app.');
      return;
    }
    const entries = await this.markets.listLiveMarkets(chatId);
    await this.send(chatId, this.markets.formatMarketsMessage(entries));
  }

  private async handleMarket(chatId: string, text: string): Promise<void> {
    const session = await this.auth.getSession(chatId);
    if (!session) {
      await this.send(chatId, 'Authenticate first: /auth <code> from the LeverX app.');
      return;
    }

    const parts = text.split(/\s+/);
    const oracleId = parts[1]?.trim();
    if (!oracleId) {
      await this.send(chatId, 'Usage: /market <oracle_id>');
      return;
    }

    const selected = await this.markets.resolveMarketSelection(chatId, oracleId);
    if (!selected) {
      await this.send(chatId, 'Unknown oracle. Send /markets for the live list.');
      return;
    }

    await this.auth.setActiveOracle(chatId, selected.oracle_id);
    await this.send(
      chatId,
      `Active market set to ${selected.label}\n${shortId(selected.oracle_id)}\n\nTrade: /up 10 4x`,
    );
  }

  private async handleMarketNumber(chatId: string, text: string): Promise<void> {
    const session = await this.auth.getSession(chatId);
    if (!session) return;

    const selected = await this.markets.resolveMarketSelection(chatId, text);
    if (!selected) {
      await this.send(chatId, 'Send /markets first, then reply with a number from the list.');
      return;
    }

    await this.auth.setActiveOracle(chatId, selected.oracle_id);
    await this.send(
      chatId,
      `Active market: ${selected.label}\n${shortId(selected.oracle_id)}\n\nExample: /up 10 4x`,
    );
  }

  private async handleBalance(chatId: string): Promise<void> {
    const session = await this.auth.getSession(chatId);
    if (!session) {
      await this.send(chatId, 'Authenticate first: /auth <code> from the LeverX app.');
      return;
    }
    const atoms = await this.trades.fetchTradingBalanceAtoms(session.account_id);
    await this.send(chatId, this.trades.formatBalanceMessage(atoms));
  }

  private async handleTrade(chatId: string, text: string): Promise<void> {
    const session = await this.auth.getSession(chatId);
    if (!session) {
      await this.send(chatId, 'Authenticate first: /auth <code> from the LeverX app.');
      return;
    }

    const match = text.match(
      /^(?:\/up|\/down|\/range)(?:@\w+)?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?x?|\d+x)$/i,
    );
    if (!match) {
      await this.send(chatId, 'Usage: /up <margin_dUSDC> <leverage>\nExample: /up 10 4x');
      return;
    }

    const side = parseTradeSide(text);
    const marginUsd = Number.parseFloat(match[1]!);
    const leverageRaw = match[2]!;

    await this.send(chatId, 'Submitting trade…');
    try {
      const result = await this.trades.openTrade(session, side, marginUsd, leverageRaw);
      await this.send(chatId, [
        'Trade submitted',
        '',
        `Side: ${result.side.toUpperCase()}`,
        `Margin: ${result.marginUsd} dUSDC`,
        `Leverage: ${result.leverage}x`,
        `Quantity: ${result.quantity}`,
        `Tx: ${explorerTxLink(result.digest)}`,
      ].join('\n'));
    } catch (err) {
      this.logger.warn(`telegram trade failed: ${formatTradeError(err)}`);
      await this.send(chatId, formatTradeError(err));
    }
  }

  private async send(chatId: string, text: string): Promise<void> {
    await this.api.sendMessage(this.cfg.botToken, chatId, text);
  }
}

function parseTradeSide(text: string): TelegramTradeSide {
  const lower = text.trim().toLowerCase();
  if (lower.startsWith('/down')) return 'down';
  if (lower.startsWith('/range')) return 'range';
  return 'up';
}

function formatTradeError(err: unknown): string {
  let code = 'trade_failed';
  if (err && typeof err === 'object') {
    if ('getResponse' in err && typeof err.getResponse === 'function') {
      const response = err.getResponse();
      if (typeof response === 'string') {
        code = response;
      } else if (response && typeof response === 'object' && 'message' in response) {
        const msg = (response as { message?: string | string[] }).message;
        code = Array.isArray(msg) ? msg.join(' ') : String(msg ?? code);
      }
    } else if ('message' in err && typeof err.message === 'string') {
      code = err.message;
    }
  }

  if (code.includes('no_active_market')) {
    return 'Select a market first: /markets then reply with a number, or /market <oracle_id>.';
  }
  if (code.includes('insufficient_trading_balance')) {
    return 'Insufficient trading account balance. Deposit dUSDC on suileverx.xyz first.';
  }
  if (code.includes('keeper_not_registered_executor')) {
    return 'Keeper is not registered as your executor. Open Portfolio and register the keeper, then retry.';
  }
  if (code.includes('leverage_blocked_final_window')) {
    return 'Leverage above 1× is blocked in the final window before expiry.';
  }
  if (code.includes('margin_out_of_bounds')) {
    return 'Margin must be between 0.1 and 100 dUSDC.';
  }
  if (code.includes('simulation_failed')) {
    return 'Trade simulation failed. Check balance, market, and try again.';
  }
  return 'Trade failed. Check /session, /balance, and /markets, then retry.';
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatDate(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function explorerTxLink(digest: string): string {
  return `https://suiscan.xyz/testnet/tx/${digest}`;
}
