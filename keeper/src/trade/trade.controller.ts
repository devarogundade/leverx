import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard';
import type {
  MintTradeBody,
  RedeemTradeBody,
  SettleTradeBody,
  RecoverManagerTradeBody,
  TradeRelayResponse,
} from './trade.types';
import { TradeService } from './trade.service';

@Controller('trade')
@UseGuards(RateLimitGuard)
export class TradeController {
  constructor(private readonly trades: TradeService) {}

  /** Execute a market mint PTB on behalf of a user (keeper = registered executor). */
  @Post('mint')
  @RateLimit({ keyPrefix: 'trade-mint', limit: 60, windowMs: 60_000 })
  mint(@Body() body: MintTradeBody): Promise<TradeRelayResponse> {
    return this.trades.relayMint(body);
  }

  /** Execute a market/limit redeem PTB on behalf of a user (keeper = registered executor). */
  @Post('redeem')
  @RateLimit({ keyPrefix: 'trade-redeem', limit: 60, windowMs: 60_000 })
  redeem(@Body() body: RedeemTradeBody): Promise<TradeRelayResponse> {
    return this.trades.relayRedeem(body);
  }

  /** Settle an expired position on behalf of a user (keeper-gated permissionless variant). */
  @Post('settle')
  @RateLimit({ keyPrefix: 'trade-settle', limit: 60, windowMs: 60_000 })
  settle(@Body() body: SettleTradeBody): Promise<TradeRelayResponse> {
    return this.trades.relaySettle(body);
  }

  /** Recover orphaned Predict manager quote into the user's trading account. */
  @Post('recover_manager')
  @RateLimit({ keyPrefix: 'trade-recover-manager', limit: 60, windowMs: 60_000 })
  recoverManager(
    @Body() body: RecoverManagerTradeBody,
  ): Promise<TradeRelayResponse> {
    return this.trades.relayRecoverManager(body);
  }
}
