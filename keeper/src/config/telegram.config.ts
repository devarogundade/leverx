import { registerAs } from '@nestjs/config';

export type TelegramConfig = {
  enabled: boolean;
  botToken: string;
  botUsername: string;
  /** Poll Telegram getUpdates (default). Webhook is used when polling is off. */
  polling: boolean;
  /** Long-poll timeout / retry backoff for getUpdates (seconds). */
  pollIntervalSec: number;
  linkTokenTtlMs: number;
  /** Minimum interval between liquidation-risk alerts for the same position. */
  alertCooldownMs: number;
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default registerAs(
  'telegram',
  (): TelegramConfig => ({
    enabled: envBool('TELEGRAM_ENABLED', false),
    botToken: (process.env.TELEGRAM_BOT_TOKEN ?? '').trim(),
    botUsername: (process.env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, ''),
    polling: envBool('TELEGRAM_POLLING', true),
    pollIntervalSec: envInt('TELEGRAM_POLL_INTERVAL_SEC', 10),
    linkTokenTtlMs: 15 * 60 * 1000,
    alertCooldownMs: 60 * 60 * 1000,
  }),
);
