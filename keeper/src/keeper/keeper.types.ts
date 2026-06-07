export const SUI_CLOCK_OBJECT_ID = '0x6';

export type PositionKeyArgs = {
  oracleId: string;
  expiryMs: number;
  strike: number;
  higherStrike: number;
  isUp: boolean;
  isRange: boolean;
};

export type TaskResult = {
  kind: string;
  target: string;
  success: boolean;
  digest?: string;
  error?: string;
  missing?: string[];
};

export type KeeperRunSummary = {
  startedAt: string;
  finishedAt: string;
  results: TaskResult[];
};
