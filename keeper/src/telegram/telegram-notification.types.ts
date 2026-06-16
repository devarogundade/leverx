import type { TaskResult } from '../keeper/keeper.types';

export type TelegramNotificationJobName = 'task_results' | 'liquidation_scan';

export type TelegramTaskResultsJobData = {
  results: TaskResult[];
};

export type TelegramLiquidationScanJobData = Record<string, never>;

export type TelegramNotificationJobData =
  | TelegramTaskResultsJobData
  | TelegramLiquidationScanJobData;
