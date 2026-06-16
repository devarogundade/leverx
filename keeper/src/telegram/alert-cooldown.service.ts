import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import type { RedisConfig } from '../config/redis.config';

const KEY_PREFIX = 'leverx:telegram:liquidation-alert:';
/** Drop stale keys after 24h — position may have closed or recovered. */
const KEY_TTL_SEC = 86_400;

@Injectable()
export class AlertCooldownService implements OnModuleDestroy {
  private readonly logger = new Logger(AlertCooldownService.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    const redisCfg = config.get<RedisConfig>('redis')!;
    this.redis = new Redis(redisCfg.connection as unknown as RedisOptions);
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis alert cooldown error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /** True when no recent alert was sent for this position within `cooldownMs`. */
  async shouldSendAlert(alertKey: string, cooldownMs: number): Promise<boolean> {
    try {
      const raw = await this.redis.get(this.key(alertKey));
      if (!raw) return true;
      const last = Number(raw);
      if (!Number.isFinite(last) || last <= 0) return true;
      return Date.now() - last >= cooldownMs;
    } catch (err) {
      this.logger.warn(`Redis get failed for ${alertKey}, allowing alert`);
      return true;
    }
  }

  /** Record the send time so repeat alerts respect the cooldown gap. */
  async markAlertSent(alertKey: string): Promise<void> {
    try {
      await this.redis.set(this.key(alertKey), String(Date.now()), 'EX', KEY_TTL_SEC);
    } catch (err) {
      this.logger.warn(`Redis set failed for ${alertKey}`);
    }
  }

  private key(alertKey: string): string {
    return `${KEY_PREFIX}${alertKey}`;
  }
}
