import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './config/constants';
import { logKeeperError } from './lib/keeper-log';

const bootstrapLogger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  logKeeperError(bootstrapLogger, 'unhandledRejection', reason);
});

process.on('uncaughtException', (err) => {
  logKeeperError(bootstrapLogger, 'uncaughtException', err);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();
  app.set('trust proxy', 1);
  app.enableCors();
  const port = DEFAULT_PORT;
  await app.listen(port);
  bootstrapLogger.log(`keeper listening on :${port}`);
  console.log(`keeper listening on :${port}`);
}

bootstrap().catch((err) => {
  logKeeperError(bootstrapLogger, 'bootstrap failed', err);
  process.exit(1);
});
