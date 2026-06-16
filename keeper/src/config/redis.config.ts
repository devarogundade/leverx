import { registerAs } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';

export type RedisConfig = {
  connection: ConnectionOptions;
};

function envOrDefault(name: string, fallback: string): string {
  const value = (process.env[name] ?? '').trim();
  return value || fallback;
}

export default registerAs('redis', (): RedisConfig => {
  const url = (process.env.REDIS_URL ?? '').trim();
  if (url) {
    return {
      connection: {
        url,
        maxRetriesPerRequest: null,
      },
    };
  }

  return {
    connection: {
      host: envOrDefault('REDIS_HOST', '127.0.0.1'),
      port: Number.parseInt(envOrDefault('REDIS_PORT', '6379'), 10),
      maxRetriesPerRequest: null,
    },
  };
});
