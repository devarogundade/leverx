import { registerAs } from '@nestjs/config';

export type TelegramConfig = {
  enabled: boolean;
  botToken: string;
  botUsername: string;
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

export default registerAs(
  'telegram',
  (): TelegramConfig => ({
    enabled: envBool('TELEGRAM_ENABLED', false),
    botToken: (process.env.TELEGRAM_BOT_TOKEN ?? '').trim(),
    botUsername: (process.env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, ''),
    linkTokenTtlMs: 15 * 60 * 1000,
    alertCooldownMs: 60 * 60 * 1000,
  }),
);
