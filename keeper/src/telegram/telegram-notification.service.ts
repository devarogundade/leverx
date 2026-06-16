import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramConfig } from '../config/telegram.config';
import { hasLiquidationDebt } from '../config/trade-math';
import { IndexerService } from '../indexer/indexer.service';
import type { LeveragedPosition } from '../indexer/indexer.types';
import type { TaskResult } from '../keeper/keeper.types';
import { logKeeperWarn } from '../lib/keeper-log';
import { PtbBuilderService } from '../sui/ptb-builder.service';
import { SuiService } from '../sui/sui.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramBotService } from './telegram-bot.service';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);
  private readonly cfg: TelegramConfig;

  constructor(
    config: ConfigService,
    private readonly bot: TelegramBotService,
    private readonly subscriptions: SubscriptionService,
    private readonly api: TelegramApiService,
    private readonly indexer: IndexerService,
    private readonly sui: SuiService,
    private readonly ptb: PtbBuilderService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  isEnabled(): boolean {
    return this.bot.isOperational();
  }

  async notifyTaskResults(results: TaskResult[]): Promise<void> {
    if (!this.isEnabled()) return;

    for (const result of results) {
      if (!result.success || result.target === '-') continue;

      if (result.kind === 'limit_order') {
        await this.notifyAccount(result.target, formatOrderFilled(result));
        continue;
      }
      if (result.kind === 'liquidation') {
        await this.notifyAccount(result.target, formatLiquidated(result));
      }
    }
  }

  async scanLiquidationAlerts(): Promise<void> {
    if (!this.isEnabled()) return;

    const accountIds = await this.subscriptions.subscribedAccountIds();
    if (accountIds.length === 0) return;

    for (const accountId of accountIds) {
      let positions: LeveragedPosition[] = [];
      try {
        const detail = await this.indexer.fetchAccount(accountId);
        positions = detail.open_positions ?? [];
      } catch (err) {
        logKeeperWarn(this.logger, `liquidation alert scan failed for ${accountId}`, err);
        continue;
      }

      for (const position of positions) {
        if (!hasLiquidationDebt(position.borrow_quote, position.margin_quote)) {
          continue;
        }
        if (BigInt(position.open_quantity || 0) === 0n) {
          continue;
        }

        const liquidatable = await this.isLiquidatable(position);
        if (!liquidatable) continue;

        const alertKey = `${position.account_id}:${position.position_key}`;
        if (!(await this.subscriptions.shouldSendAlert(alertKey, this.cfg.alertCooldownMs))) {
          continue;
        }

        const sent = await this.notifyAccount(
          alertKey,
          formatLiquidationAlert(position),
        );
        if (sent) {
          await this.subscriptions.markAlertSent(alertKey);
        }
      }
    }
  }

  private async notifyAccount(target: string, text: string): Promise<boolean> {
    const accountId = target.split(':')[0]?.trim();
    if (!accountId) return false;

    const chatIds = await this.subscriptions.getChatIdsForAccount(accountId);
    if (chatIds.length === 0) return false;

    let anySent = false;
    for (const chatId of chatIds) {
      const ok = await this.api.sendMessage(this.cfg.botToken, chatId, text);
      anySent = anySent || ok;
    }
    return anySent;
  }

  private async isLiquidatable(position: LeveragedPosition): Promise<boolean> {
    const cfg = this.sui.getConfig();
    const tx = this.ptb.buildIsLiquidatable(cfg, position);
    return (await this.sui.devInspectBool(tx)) === true;
  }
}

function formatOrderFilled(result: TaskResult): string {
  const [accountId, positionKey] = splitTarget(result.target);
  return [
    'Limit order filled',
    '',
    `Account: ${shortId(accountId)}`,
    `Market key: ${shortId(positionKey)}`,
    result.digest ? `Tx: ${explorerTxLink(result.digest)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatLiquidated(result: TaskResult): string {
  const [accountId, positionKey] = splitTarget(result.target);
  return [
    'Position liquidated',
    '',
    `Account: ${shortId(accountId)}`,
    `Market key: ${shortId(positionKey)}`,
    result.digest ? `Tx: ${explorerTxLink(result.digest)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatLiquidationAlert(position: LeveragedPosition): string {
  return [
    'Liquidation risk',
    '',
    `Account: ${shortId(position.account_id)}`,
    `Market key: ${shortId(position.position_key)}`,
    `Borrow: ${formatQuote(position.borrow_quote)}`,
    `Margin: ${formatQuote(position.margin_quote)}`,
    '',
    'Your position is eligible for liquidation. Add margin or reduce exposure.',
  ].join('\n');
}

function splitTarget(target: string): [string, string] {
  const idx = target.indexOf(':');
  if (idx <= 0) return [target, '-'];
  return [target.slice(0, idx), target.slice(idx + 1)];
}

function shortId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}

function formatQuote(value: number): string {
  return `${(value / 1_000_000).toFixed(2)} dUSDC`;
}

function explorerTxLink(digest: string): string {
  return `https://suiscan.xyz/testnet/tx/${digest}`;
}
