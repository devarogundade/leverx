import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard';
import { TelegramBotService } from './telegram-bot.service';
import type { TelegramUpdate } from './telegram.types';

type LinkTokenBody = {
  owner: string;
  account_id: string;
};

@Controller('telegram')
@UseGuards(RateLimitGuard)
export class TelegramController {
  constructor(private readonly bot: TelegramBotService) {}

  /** Create a one-time deep-link payload for Telegram subscription. */
  @Post('link-token')
  @RateLimit({ keyPrefix: 'telegram-link', limit: 30, windowMs: 60_000 })
  createLinkToken(@Body() body: LinkTokenBody) {
    return this.bot.createLinkToken(body.owner, body.account_id);
  }

  /** Subscription status for a trading account (owner must match indexer). */
  @Get('subscription')
  @RateLimit({ keyPrefix: 'telegram-sub', limit: 60, windowMs: 60_000 })
  getSubscription(
    @Query('owner') owner: string,
    @Query('account_id') accountId: string,
  ) {
    return this.bot.getSubscriptionStatus(owner, accountId);
  }

  /** Telegram webhook — register `https://keeper.suileverx.xyz/telegram/webhook` with BotFather/setWebhook. */
  @Post('webhook')
  @RateLimit({ keyPrefix: 'telegram-webhook', limit: 500, windowMs: 60_000 })
  async webhook(@Body() update: TelegramUpdate) {
    await this.bot.handleWebhookUpdate(update);
    return { ok: true };
  }
}
