import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import type { KeeperConfig } from '../config/keeper.config';
import { KeeperOrchestratorService } from './keeper-orchestrator.service';

@Injectable()
export class KeeperScheduler implements OnModuleInit {
  private readonly logger = new Logger(KeeperScheduler.name);
  private readonly cfg: KeeperConfig;

  constructor(
    config: ConfigService,
    private readonly orchestrator: KeeperOrchestratorService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.cfg = config.get<KeeperConfig>('keeper')!;
  }

  onModuleInit() {
    if (!this.cfg.enabled) {
      this.logger.warn('keeper disabled in constants.ts — cron jobs not registered');
      return;
    }

    this.register('settlement', this.cfg.cron.settlement, () =>
      this.orchestrator.run('settlement'),
    );
    this.register('limit_order', this.cfg.cron.limitOrder, () =>
      this.orchestrator.run('limit_order'),
    );
    this.register('liquidation', this.cfg.cron.liquidation, () =>
      this.orchestrator.run('liquidation'),
    );
    this.register('trigger', this.cfg.cron.trigger, () =>
      this.orchestrator.run('trigger'),
    );
  }

  private register(name: string, expression: string, fn: () => Promise<unknown>) {
    const job = new CronJob(expression, async () => {
      try {
        await fn();
      } catch (err) {
        this.logger.error(`${name} cron failed: ${String(err)}`);
      }
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`registered cron "${name}" (${expression})`);
  }
}
