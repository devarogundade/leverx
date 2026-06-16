import { Global, Module } from '@nestjs/common';
import { KeeperApiKeyGuard, KeeperAdminGuard } from './keeper-api-key.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [RateLimitService, RateLimitGuard, KeeperApiKeyGuard, KeeperAdminGuard],
  exports: [RateLimitService, RateLimitGuard, KeeperApiKeyGuard, KeeperAdminGuard],
})
export class AuthModule {}
