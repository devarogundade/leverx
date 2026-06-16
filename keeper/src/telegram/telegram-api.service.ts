import { Injectable, Logger } from '@nestjs/common';
import { logKeeperWarn } from '../lib/keeper-log';

@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);

  async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
  ): Promise<boolean> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logKeeperWarn(
          this.logger,
          `telegram sendMessage failed chat=${chatId}`,
          new Error(`HTTP ${res.status} ${body.slice(0, 200)}`),
        );
        return false;
      }
      return true;
    } catch (err) {
      logKeeperWarn(this.logger, `telegram sendMessage failed chat=${chatId}`, err);
      return false;
    }
  }

  async deleteWebhook(botToken: string): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logKeeperWarn(
          this.logger,
          'telegram deleteWebhook failed',
          new Error(`HTTP ${res.status} ${body.slice(0, 200)}`),
        );
      }
    } catch (err) {
      logKeeperWarn(this.logger, 'telegram deleteWebhook failed', err);
    }
  }

  async getUpdates(
    botToken: string,
    offset: number,
    timeoutSec: number,
  ): Promise<{ updates: unknown[]; nextOffset: number }> {
    const url = new URL(`https://api.telegram.org/bot${botToken}/getUpdates`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('timeout', String(timeoutSec));
    url.searchParams.set('allowed_updates', JSON.stringify(['message']));

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`getUpdates HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      ok: boolean;
      result?: Array<{ update_id: number }>;
    };
    if (!body.ok || !body.result) {
      throw new Error('getUpdates failed');
    }
    const updates = body.result;
    const nextOffset =
      updates.length > 0 ? updates[updates.length - 1]!.update_id + 1 : offset;
    return { updates, nextOffset };
  }
}
