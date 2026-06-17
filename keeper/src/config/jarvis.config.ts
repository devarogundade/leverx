import { registerAs } from '@nestjs/config';
import { JARVIS_RUN_INTERVAL_MS } from '../jarvis/jarvis.constants';

export type JarvisConfig = {
  enabled: boolean;
  anthropicApiKey: string | null;
  model: string;
  intervalMs: number;
  marketsLimit: number;
  marketSlippageBps: number;
  deepbookIndexerUrl: string;
};

export default registerAs('jarvis', (): JarvisConfig => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  return {
    enabled: process.env.JARVIS_ENABLED !== 'false',
    anthropicApiKey: apiKey,
    model:
      process.env.JARVIS_ANTHROPIC_MODEL?.trim() ||
      process.env.JARVIS_MODEL?.trim() ||
      'claude-haiku-4-5-20251001',
    intervalMs: Number(process.env.JARVIS_INTERVAL_MS ?? JARVIS_RUN_INTERVAL_MS),
    marketsLimit: Number(process.env.JARVIS_MARKETS_LIMIT ?? 10),
    marketSlippageBps: Number(process.env.JARVIS_MARKET_SLIPPAGE_BPS ?? 100),
    deepbookIndexerUrl:
      process.env.DEEPBOOK_INDEXER_URL?.trim() ||
      'https://deepbook-indexer.mainnet.mystenlabs.com',
  };
});
