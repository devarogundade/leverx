import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { TaskResult } from '../keeper/keeper.types';
import { logKeeperWarn } from '../lib/keeper-log';
import { TELEGRAM_NOTIFICATIONS_QUEUE } from './telegram-notifications.constants';
import type {
  TelegramLiquidationScanJobData,
  TelegramTaskResultsJobData,
} from './telegram-notification.types';
import { TelegramNotificationService } from './telegram-notification.service';

const NOTIFIER_JOB_OPTS = {
  removeOnComplete: 200,
  removeOnFail: 100,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },
};

@Injectable()
export class TelegramNotificationQueueService {
  private readonly logger = new Logger(TelegramNotificationQueueService.name);

  constructor(
    @InjectQueue(TELEGRAM_NOTIFICATIONS_QUEUE)
    private readonly queue: Queue,
    private readonly notifications: TelegramNotificationService,
  ) {}

  isEnabled(): boolean {
    return this.notifications.isEnabled();
  }

  async enqueueTaskResults(results: TaskResult[]): Promise<void> {
    if (!this.isEnabled()) return;

    const notifiable = results.filter(
      (result) =>
        result.success &&
        result.target !== '-' &&
        (result.kind === 'limit_order' || result.kind === 'liquidation'),
    );
    if (notifiable.length === 0) return;

    try {
      await this.queue.add(
        'task_results',
        { results: notifiable } satisfies TelegramTaskResultsJobData,
        NOTIFIER_JOB_OPTS,
      );
    } catch (err) {
      logKeeperWarn(this.logger, 'failed to enqueue telegram task_results job', err);
    }
  }

  async enqueueLiquidationScan(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.queue.add(
        'liquidation_scan',
        {} satisfies TelegramLiquidationScanJobData,
        {
          ...NOTIFIER_JOB_OPTS,
          jobId: `liquidation_scan-${Math.floor(Date.now() / 60_000)}`,
        },
      );
    } catch (err) {
      logKeeperWarn(this.logger, 'failed to enqueue telegram liquidation_scan job', err);
    }
  }
}
