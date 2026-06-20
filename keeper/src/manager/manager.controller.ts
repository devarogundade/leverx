import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { parseBearerToken } from '../auth/parse-bearer-token';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard';
import type { CreateManagerBody, ManagerResponse } from './manager.types';
import { ManagerService } from './manager.service';

@Controller()
@UseGuards(RateLimitGuard)
export class ManagerController {
  constructor(private readonly managers: ManagerService) {}

  /** Create or return the keeper-owned Predict manager for a user wallet (one per address). */
  @Post('create-manager')
  @RateLimit({ keyPrefix: 'create-manager', limit: 20, windowMs: 60_000 })
  createManager(
    @Body() body: CreateManagerBody,
    @Headers('authorization') authorization?: string,
  ): Promise<ManagerResponse> {
    return this.managers.createOrGetManager(body, parseBearerToken(authorization));
  }

  /** Lookup Predict manager id for a user wallet (store, then indexer). */
  @Get(['manager/:address', 'managers/:address'])
  getManager(@Param('address') address: string): Promise<ManagerResponse> {
    return this.managers.getManager(address);
  }
}
