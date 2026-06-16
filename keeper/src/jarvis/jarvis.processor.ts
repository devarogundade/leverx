import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { Repository } from 'typeorm';
import type { JarvisConfig } from '../config/jarvis.config';
import { JarvisSettingsEntity } from '../database/entities/jarvis-settings.entity';
import { logKeeperError } from '../lib/keeper-log';
import {
  JARVIS_FINAL_WINDOW_INTERVAL_MS,
  JARVIS_JOB_NAME,
  JARVIS_QUEUE,
  jarvisFastSchedulerId,
  jarvisSchedulerId,
} from './jarvis.constants';
import { JarvisService } from './jarvis.service';
import { JarvisJobDataSchema } from './jarvis.schemas';
import type { JarvisJobData } from './jarvis.schemas';

@Processor(JARVIS_QUEUE)
export class JarvisProcessor extends WorkerHost {
  private readonly logger = new Logger(JarvisProcessor.name);

  constructor(private readonly jarvis: JarvisService) {
    super();
  }

  async process(job: Job<JarvisJobData>): Promise<void> {
    const { userAddress, accountId } = job.data;
    try {
      await this.jarvis.runLifecycle(userAddress, accountId);
    } catch (err) {
      logKeeperError(
        this.logger,
        `jarvis job failed for ${accountId}`,
        err,
      );
      throw err;
    }
  }
}

@Injectable()
export class JarvisScheduler implements OnModuleInit {
  private readonly logger = new Logger(JarvisScheduler.name);
  private readonly cfg: JarvisConfig;

  constructor(
    config: ConfigService,
    @InjectQueue(JARVIS_QUEUE) private readonly queue: Queue,
    @InjectRepository(JarvisSettingsEntity)
    private readonly settingsRepo: Repository<JarvisSettingsEntity>,
  ) {
    this.cfg = config.get<JarvisConfig>('jarvis')!;
  }

  async onModuleInit(): Promise<void> {
    // JarvisService.onModuleInit calls syncAllEnabledJobs after DI is ready.
  }

  async syncAllEnabledJobs(): Promise<void> {
    if (!this.cfg.enabled) return;

    const enabled = await this.settingsRepo.find({ where: { enabled: true } });
    for (const row of enabled) {
      await this.registerAccountJob(row.user_address, row.account_id);
    }
    this.logger.log(`synced ${enabled.length} jarvis repeatable job(s)`);
  }

  async registerAccountJob(userAddress: string, accountId: string): Promise<void> {
    const schedulerId = jarvisSchedulerId(accountId);
    await this.queue.upsertJobScheduler(
      schedulerId,
      { every: this.cfg.intervalMs },
      {
        name: JARVIS_JOB_NAME,
        data: JarvisJobDataSchema.parse({ userAddress, accountId }),
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
    this.logger.log(
      `registered jarvis scheduler "${schedulerId}" every ${this.cfg.intervalMs}ms`,
    );

    // Run first cycle immediately
    await this.queue.add(
      JARVIS_JOB_NAME,
      JarvisJobDataSchema.parse({ userAddress, accountId }),
      {
      jobId: `${schedulerId}-bootstrap-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: 20,
    });
  }

  async registerFastAccountJob(userAddress: string, accountId: string): Promise<void> {
    const schedulerId = jarvisFastSchedulerId(accountId);
    await this.queue.upsertJobScheduler(
      schedulerId,
      { every: JARVIS_FINAL_WINDOW_INTERVAL_MS },
      {
        name: JARVIS_JOB_NAME,
        data: JarvisJobDataSchema.parse({ userAddress, accountId }),
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
    this.logger.log(
      `registered jarvis fast scheduler "${schedulerId}" every ${JARVIS_FINAL_WINDOW_INTERVAL_MS}ms`,
    );
  }

  async removeFastAccountJob(accountId: string): Promise<void> {
    const schedulerId = jarvisFastSchedulerId(accountId);
    try {
      await this.queue.removeJobScheduler(schedulerId);
      this.logger.log(`removed jarvis fast scheduler "${schedulerId}"`);
    } catch (err) {
      logKeeperError(this.logger, `remove jarvis fast scheduler ${schedulerId}`, err);
    }
  }

  async removeAccountJob(accountId: string): Promise<void> {
    const schedulerId = jarvisSchedulerId(accountId);
    try {
      await this.queue.removeJobScheduler(schedulerId);
      this.logger.log(`removed jarvis scheduler "${schedulerId}"`);
    } catch (err) {
      logKeeperError(this.logger, `remove jarvis scheduler ${schedulerId}`, err);
    }
    await this.removeFastAccountJob(accountId);
  }
}
