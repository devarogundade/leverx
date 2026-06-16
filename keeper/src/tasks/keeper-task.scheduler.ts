import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { KeeperConfig } from '../config/keeper.config';
import type { KeeperTaskKind } from './keeper-orchestrator.service';
import { KEEPER_TASKS_QUEUE } from './keeper-tasks.constants';

type ScheduledTaskKind = Exclude<KeeperTaskKind, 'all'>;

const TASK_SCHEDULES: ReadonlyArray<{
  kind: ScheduledTaskKind;
  cronKey: keyof KeeperConfig['cron'];
}> = [
  { kind: 'limit_order', cronKey: 'limitOrder' },
  { kind: 'liquidation', cronKey: 'liquidation' },
  { kind: 'trigger', cronKey: 'trigger' },
  { kind: 'force_close', cronKey: 'forceClose' },
];

@Injectable()
export class KeeperTaskScheduler implements OnModuleInit {
  private readonly logger = new Logger(KeeperTaskScheduler.name);
  private readonly cfg: KeeperConfig;

  constructor(
    config: ConfigService,
    @InjectQueue(KEEPER_TASKS_QUEUE) private readonly queue: Queue,
  ) {
    this.cfg = config.get<KeeperConfig>('keeper')!;
  }

  async onModuleInit() {
    if (!this.cfg.enabled) {
      this.logger.warn(
        'keeper disabled in constants.ts — repeatable jobs not registered',
      );
      return;
    }

    for (const { kind, cronKey } of TASK_SCHEDULES) {
      const pattern = this.cfg.cron[cronKey];
      await this.queue.upsertJobScheduler(
        kind,
        { pattern },
        {
          name: kind,
          data: { kind },
          opts: {
            removeOnComplete: true,
            removeOnFail: 100,
          },
        },
      );
      this.logger.log(`registered repeatable job "${kind}" (${pattern})`);
    }
  }
}
