import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { logKeeperError } from '../lib/keeper-log';
import { TELEGRAM_NOTIFICATIONS_QUEUE } from './telegram-notifications.constants';
import type {
  TelegramLiquidationScanJobData,
  TelegramNotificationJobName,
  TelegramTaskResultsJobData,
} from './telegram-notification.types';
import { TelegramNotificationService } from './telegram-notification.service';

@Processor(TELEGRAM_NOTIFICATIONS_QUEUE)
export class TelegramNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramNotificationProcessor.name);

  constructor(private readonly notifications: TelegramNotificationService) {
    super();
  }

  async process(
    job: Job<
      TelegramTaskResultsJobData | TelegramLiquidationScanJobData,
      void,
      TelegramNotificationJobName
    >,
  ): Promise<void> {
    try {
      if (job.name === 'task_results') {
        await this.notifications.notifyTaskResults(job.data.results);
        return;
      }
      if (job.name === 'liquidation_scan') {
        await this.notifications.scanLiquidationAlerts();
        return;
      }
      this.logger.warn(`unknown telegram notification job: ${job.name}`);
    } catch (err) {
      logKeeperError(this.logger, `telegram notification job "${job.name}" failed`, err);
      throw err;
    }
  }
}
