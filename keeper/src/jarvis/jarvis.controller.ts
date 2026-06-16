import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard';
import {
  JarvisAccountBodySchema,
  JarvisEventsQuerySchema,
  JarvisMarkReadBodySchema,
  JarvisStatusQuerySchema,
  JarvisUpdateSettingsBodySchema,
} from './jarvis.schemas';
import { JarvisService } from './jarvis.service';

@Controller('jarvis')
@UseGuards(RateLimitGuard)
export class JarvisController {
  constructor(private readonly jarvis: JarvisService) {}

  @Get('status')
  @RateLimit({ keyPrefix: 'jarvis-status', limit: 60, windowMs: 60_000 })
  getStatus(
    @Query('owner') owner: string,
    @Query('account_id') accountId: string,
  ) {
    const query = parseOrBadRequest(JarvisStatusQuerySchema, {
      owner,
      account_id: accountId,
    });
    return this.jarvis.getStatus(query.owner, query.account_id);
  }

  @Get('settings')
  @RateLimit({ keyPrefix: 'jarvis-settings', limit: 60, windowMs: 60_000 })
  getSettings(
    @Query('owner') owner: string,
    @Query('account_id') accountId: string,
  ) {
    const query = parseOrBadRequest(JarvisStatusQuerySchema, {
      owner,
      account_id: accountId,
    });
    return this.jarvis.getSettings(query.owner, query.account_id);
  }

  @Patch('settings')
  @RateLimit({ keyPrefix: 'jarvis-settings', limit: 30, windowMs: 60_000 })
  updateSettings(@Body() body: unknown) {
    const parsed = parseOrBadRequest(JarvisUpdateSettingsBodySchema, body);
    return this.jarvis.updateSettings(parsed);
  }

  @Post('enable')
  @RateLimit({ keyPrefix: 'jarvis-enable', limit: 20, windowMs: 60_000 })
  enable(@Body() body: unknown) {
    const parsed = parseOrBadRequest(JarvisAccountBodySchema, body);
    return this.jarvis.enable(parsed.owner, parsed.account_id);
  }

  @Post('disable')
  @RateLimit({ keyPrefix: 'jarvis-disable', limit: 20, windowMs: 60_000 })
  disable(@Body() body: unknown) {
    const parsed = parseOrBadRequest(JarvisAccountBodySchema, body);
    return this.jarvis.disable(parsed.owner, parsed.account_id);
  }

  @Get('events')
  @RateLimit({ keyPrefix: 'jarvis-events', limit: 60, windowMs: 60_000 })
  listEvents(
    @Query('owner') owner: string,
    @Query('account_id') accountId: string,
    @Query('limit') limit?: string,
  ) {
    const query = parseOrBadRequest(JarvisEventsQuerySchema, {
      owner,
      account_id: accountId,
      limit,
    });
    return this.jarvis.listEvents(query.owner, query.account_id, query.limit);
  }

  @Post('events/read')
  @RateLimit({ keyPrefix: 'jarvis-read', limit: 60, windowMs: 60_000 })
  markRead(@Body() body: unknown) {
    const parsed = parseOrBadRequest(JarvisMarkReadBodySchema, body);
    return this.jarvis.markRead(parsed.owner, parsed.account_id, parsed.event_ids);
  }
}

function parseOrBadRequest<T>(
  schema: { parse: (input: unknown) => T },
  input: unknown,
): T {
  try {
    return schema.parse(input);
  } catch {
    throw new BadRequestException('invalid_jarvis_request');
  }
}
