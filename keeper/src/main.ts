import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule);
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
