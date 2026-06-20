import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import type { RedisConfig } from '../config/redis.config';
import type { TelegramConfig } from '../config/telegram.config';
import type { KeeperConfig } from '../config/keeper.config';
import { SuiService } from '../sui/sui.service';
import type {
  PredictOracleRow,
  PredictOracleState,
  TelegramMarketsListEntry,
} from './telegram-session.types';
import {
  parseOracleState,
  parsePredictOraclesList,
} from '../lib/predict-oracle-parse';
import {
  baseFromUnderlying,
  formatTimeRemaining,
} from './telegram-trade-math';

const MARKETS_CACHE_PREFIX = 'leverx:telegram:markets:';

@Injectable()
export class TelegramMarketsService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramMarketsService.name);
  private readonly redis: Redis;
  private readonly cfg: TelegramConfig;

  constructor(
    config: ConfigService,
    private readonly sui: SuiService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
    const redisCfg = config.get<RedisConfig>('redis')!;
    this.redis = new Redis(redisCfg.connection as unknown as RedisOptions);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async listLiveMarkets(chatId: string): Promise<TelegramMarketsListEntry[]> {
    const keeperCfg = this.sui.getConfig();
    const oracles = await this.fetchPredictOracles(keeperCfg);
    const now = Date.now();
    const live = oracles
      .filter(
        (row) =>
          row.oracle_id &&
          String(row.status ?? '').toLowerCase() === 'active' &&
          (row.expiry ?? 0) > now,
      )
      .sort((a, b) => (a.expiry ?? 0) - (b.expiry ?? 0))
      .slice(0, this.cfg.marketsListLimit);

    const entries = live.map((row, index) => ({
      index: index + 1,
      oracle_id: row.oracle_id.toLowerCase(),
      underlying: baseFromUnderlying(row.underlying_asset),
      label: `${baseFromUnderlying(row.underlying_asset)} · ${formatTimeRemaining(row.expiry ?? 0, now)} left`,
      expiry_ms: row.expiry ?? 0,
    }));

    await this.redis.set(
      `${MARKETS_CACHE_PREFIX}${chatId}`,
      JSON.stringify(entries),
      'EX',
      3_600,
    );
    return entries;
  }

  async resolveMarketSelection(
    chatId: string,
    selection: string,
  ): Promise<TelegramMarketsListEntry | null> {
    const trimmed = selection.trim().toLowerCase();
    if (/^0x[a-f0-9]{64}$/.test(trimmed)) {
      const keeperCfg = this.sui.getConfig();
      const oracles = await this.fetchPredictOracles(keeperCfg);
      const match = oracles.find((row) => row.oracle_id.toLowerCase() === trimmed);
      if (!match) return null;
      return {
        index: 0,
        oracle_id: trimmed,
        underlying: baseFromUnderlying(match.underlying_asset),
        label: baseFromUnderlying(match.underlying_asset),
        expiry_ms: match.expiry ?? 0,
      };
    }

    const index = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(index) || index < 1) return null;

    const raw = await this.redis.get(`${MARKETS_CACHE_PREFIX}${chatId}`);
    if (!raw) return null;
    try {
      const entries = JSON.parse(raw) as TelegramMarketsListEntry[];
      return entries.find((row) => row.index === index) ?? null;
    } catch {
      return null;
    }
  }

  async fetchOracleState(oracleId: string): Promise<PredictOracleState | null> {
    const url = `${this.sui.getConfig().predictServerUrl}/oracles/${oracleId}/state`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return parseOracleState(await res.json());
    } catch (err) {
      this.logger.warn(`oracle state fetch failed for ${oracleId}: ${String(err)}`);
      return null;
    }
  }

  formatMarketsMessage(entries: TelegramMarketsListEntry[]): string {
    if (entries.length === 0) {
      return 'No live markets right now. Try again later.';
    }
    const lines = entries.map(
      (row) =>
        `${row.index}. ${row.label}\n   ${shortId(row.oracle_id)}`,
    );
    return [
      'Live markets',
      '',
      ...lines,
      '',
      'Reply with a number (1–10) or /market <oracle_id> to select.',
    ].join('\n');
  }

  private async fetchPredictOracles(cfg: KeeperConfig): Promise<PredictOracleRow[]> {
    const url = `${cfg.predictServerUrl}/predicts/${cfg.predictId}/oracles`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      return parsePredictOraclesList(await res.json());
    } catch (err) {
      this.logger.warn(`predict oracle list fetch failed: ${String(err)}`);
      return [];
    }
  }
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}
