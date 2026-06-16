import { registerAs } from '@nestjs/config';

export type DatabaseConfig = {
  url: string;
  synchronize: boolean;
  logging: boolean;
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}

const DEFAULT_URL =
  'postgres://leverx:leverx@localhost:5433/leverx_indexer';

export default registerAs(
  'database',
  (): DatabaseConfig => ({
    url:
      (process.env.DATABASE_URL ?? process.env.KEEPER_DATABASE_URL ?? '').trim() ||
      DEFAULT_URL,
    synchronize: envBool('DATABASE_SYNCHRONIZE', true),
    logging: envBool('DATABASE_LOGGING', false),
  }),
);
