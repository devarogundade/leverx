import { Global, Module } from '@nestjs/common';
import { AppJwtService } from './app-jwt.service';
import { KeeperApiKeyGuard, KeeperAdminGuard } from './keeper-api-key.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [
    RateLimitService,
    RateLimitGuard,
    KeeperApiKeyGuard,
    KeeperAdminGuard,
    AppJwtService,
  ],
  exports: [
    RateLimitService,
    RateLimitGuard,
    KeeperApiKeyGuard,
    KeeperAdminGuard,
    AppJwtService,
  ],
})
export class AuthModule {}
