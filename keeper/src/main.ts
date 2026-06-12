import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './config/constants';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = DEFAULT_PORT;
  await app.listen(port);
  logger.log(`keeper listening on :${port}`);
}
bootstrap();
