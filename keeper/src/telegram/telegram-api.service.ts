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
}
