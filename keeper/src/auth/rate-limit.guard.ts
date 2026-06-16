import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RateLimitService } from './rate-limit.service';

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  keyPrefix: string;
};

export const RATE_LIMIT_METADATA = 'keeper:rate_limit';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limits: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_METADATA,
      context.getHandler(),
    );
    if (!options) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    this.limits.assertAllowed(key, options.limit, options.windowMs);
    return true;
  }
}
