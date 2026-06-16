import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DatabaseConfig } from '../config/database.config';
import { JarvisEventEntity } from './entities/jarvis-event.entity';
import { JarvisSettingsEntity } from './entities/jarvis-settings.entity';
import { TelegramLinkTokenEntity } from './entities/telegram-link-token.entity';
import { TelegramSubscriptionEntity } from './entities/telegram-subscription.entity';
import { UserManagerEntity } from './entities/user-manager.entity';

export const KEEPER_ENTITIES = [
  TelegramSubscriptionEntity,
  TelegramLinkTokenEntity,
  UserManagerEntity,
  JarvisSettingsEntity,
  JarvisEventEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<DatabaseConfig>('database')!;
        return {
          type: 'postgres' as const,
          url: db.url,
          entities: KEEPER_ENTITIES,
          synchronize: db.synchronize,
          logging: db.logging,
          autoLoadEntities: false,
        };
      },
    }),
    TypeOrmModule.forFeature(KEEPER_ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
