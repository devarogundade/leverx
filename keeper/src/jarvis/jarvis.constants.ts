export const JARVIS_QUEUE = 'jarvis-tasks';

export const JARVIS_JOB_NAME = 'run';

/** Repeatable job interval per enabled trading account (default 5 min). */
export const JARVIS_RUN_INTERVAL_MS = 5 * 60 * 1000;

/** Accelerated interval when positions are in the final window (1 min). */
export const JARVIS_FINAL_WINDOW_INTERVAL_MS = 60_000;

export const JARVIS_DEFAULT_MAX_LEVERAGE = 5;
export const JARVIS_DEFAULT_MAX_PORTFOLIO_PCT = 20;
export const JARVIS_DEFAULT_MAX_OPEN_POSITIONS = 3;
export const JARVIS_DEFAULT_RISK_PROFILE = 'balanced' as const;

export function jarvisSchedulerId(accountId: string): string {
  return `jarvis-${accountId.toLowerCase()}`;
}

export function jarvisFastSchedulerId(accountId: string): string {
  return `jarvis-fast-${accountId.toLowerCase()}`;
}
