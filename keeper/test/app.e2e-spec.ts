import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { QueueModule } from './../src/queue/queue.module';
import { TelegramModule } from './../src/telegram/telegram.module';
import { TasksModule } from './../src/tasks/tasks.module';
import { TasksModuleWithoutQueue } from './tasks-module-without-queue';
import { TelegramModuleWithoutWorker } from './telegram-module-without-worker';
import { QueueModuleWithoutBull } from './queue-module-without-bull';

describe('Keeper (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(QueueModule)
      .useModule(QueueModuleWithoutBull)
      .overrideModule(TasksModule)
      .useModule(TasksModuleWithoutQueue)
      .overrideModule(TelegramModule)
      .useModule(TelegramModuleWithoutWorker)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.ok).toBe(true);
        expect(res.body.service).toBe('keeper');
      });
  });
});
