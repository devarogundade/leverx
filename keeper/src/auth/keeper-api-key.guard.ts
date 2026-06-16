import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { KeeperConfig } from '../config/keeper.config';

export const KEEPER_API_KEY_HEADER = 'x-keeper-api-key';

/** When `KEEPER_API_KEY` is set, require matching header on protected routes. */
@Injectable()
export class KeeperApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<KeeperConfig>('keeper')?.apiKey?.trim();
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header(KEEPER_API_KEY_HEADER)?.trim();
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('invalid_api_key');
    }
    return true;
  }
}

/** Admin routes require `KEEPER_API_KEY` to be configured and presented. */
@Injectable()
export class KeeperAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<KeeperConfig>('keeper')?.apiKey?.trim();
    if (!expected) {
      throw new ServiceUnavailableException('admin_routes_disabled');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header(KEEPER_API_KEY_HEADER)?.trim();
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('invalid_api_key');
    }
    return true;
  }
}
