import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import keeperConfig from './keeper.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../keeper/.env'],
      load: [keeperConfig],
    }),
  ],
})
export class AppConfigModule {}
