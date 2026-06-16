import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard';
import { GasService } from './gas.service';
import type {
  GasExecuteBody,
  GasExecuteResponse,
  GasSponsorBody,
  GasSponsorResponse,
} from './gas.types';

@Controller('gas')
@UseGuards(RateLimitGuard)
export class GasController {
  constructor(private readonly gas: GasService) {}

  /** Enoki sponsor step — keeper calls Enoki with the private API key. */
  @Post('sponsor')
  @RateLimit({ keyPrefix: 'gas-sponsor', limit: 120, windowMs: 60_000 })
  sponsor(@Body() body: GasSponsorBody): Promise<GasSponsorResponse> {
    return this.gas.sponsor(body);
  }

  /** Enoki execute step — submit the user signature for a sponsored PTB. */
  @Post('sponsor/execute')
  @RateLimit({ keyPrefix: 'gas-sponsor-execute', limit: 120, windowMs: 60_000 })
  execute(@Body() body: GasExecuteBody): Promise<GasExecuteResponse> {
    return this.gas.execute(body);
  }
}
