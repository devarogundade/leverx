import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import jarvisConfig from './jarvis.config';
import keeperConfig from './keeper.config';
import redisConfig from './redis.config';
import databaseConfig from './database.config';
import telegramConfig from './telegram.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../keeper/.env'],
      load: [keeperConfig, redisConfig, databaseConfig, telegramConfig, jarvisConfig],
    }),
  ],
})
export class AppConfigModule {}
