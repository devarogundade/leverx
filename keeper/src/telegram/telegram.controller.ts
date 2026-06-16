import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
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

  /** Generate a one-time OTP for Telegram trading auth (app → bot /auth). */
  @Post('auth/otp')
  @RateLimit({ keyPrefix: 'telegram-otp', limit: 20, windowMs: 60_000 })
  createTradingOtp(@Body() body: LinkTokenBody) {
    return this.bot.createTradingOtp(body.owner, body.account_id);
  }

  /** Active Telegram trading session for this account (if any). */
  @Get('auth/session')
  @RateLimit({ keyPrefix: 'telegram-session', limit: 60, windowMs: 60_000 })
  getTradingSession(
    @Query('owner') owner: string,
    @Query('account_id') accountId: string,
  ) {
    return this.bot.getTradingSessionStatus(owner, accountId);
  }

  /** Disconnect all Telegram trading sessions for this account (from app). */
  @Delete('auth/session')
  @RateLimit({ keyPrefix: 'telegram-revoke', limit: 20, windowMs: 60_000 })
  revokeTradingSession(@Body() body: LinkTokenBody) {
    return this.bot.revokeTradingSession(body.owner, body.account_id);
  }

  /** Telegram webhook — register `https://keeper.suileverx.xyz/telegram/webhook` with BotFather/setWebhook. */
  @Post('webhook')
  @RateLimit({ keyPrefix: 'telegram-webhook', limit: 500, windowMs: 60_000 })
  async webhook(@Body() update: TelegramUpdate) {
    await this.bot.handleWebhookUpdate(update);
    return { ok: true };
  }
}
