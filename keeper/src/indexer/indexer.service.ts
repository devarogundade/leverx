import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeeperConfig } from '../config/keeper.config';
import { logKeeperError, logKeeperWarn } from '../lib/keeper-log';
import type {
  LeveragedPosition,
  LeverxEvent,
  LimitMintOrder,
  OrderBookResponse,
  Paginated,
  PositionTrigger,
  ProtocolSettings,
  ProxyExecutor,
  UserProxy,
} from './indexer.types';

function isIndexerRetryableError(err: unknown): boolean {
  const message = String(err ?? '').toLowerCase();
  if (
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up')
  ) {
    return true;
  }
  if (message.includes('http 502') || message.includes('http 503') || message.includes('http 504')) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    const cfg = config.get<KeeperConfig>('keeper')!;
    this.baseUrl = cfg.indexerUrl;
  }

  private buildQuery(
    args?: Record<string, string | number | boolean | undefined>,
  ): string {
    const q = new URLSearchParams();
    if (!args) return '';
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) q.set(key, String(value));
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  async get<T>(path: string, options?: { retries?: number }): Promise<T> {
    const retries = options?.retries ?? 0;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const url = `${this.baseUrl}${path}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text();
          const err = new Error(`HTTP ${res.status} ${body.slice(0, 500)}`);
          if (attempt < retries && res.status >= 500) {
            lastErr = err;
            await sleep(300 * 2 ** attempt);
            continue;
          }
          throw err;
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        if (attempt < retries && isIndexerRetryableError(err)) {
          logKeeperWarn(
            this.logger,
            `indexer GET ${path} retry ${attempt + 1}/${retries}`,
            err,
          );
          await sleep(300 * 2 ** attempt);
          continue;
        }
        const message = logKeeperError(this.logger, `indexer GET ${path}`, err, {
          url,
          baseUrl: this.baseUrl,
        });
        throw new Error(message);
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Walk paginated indexer lists until `has_more` is false or `maxItems` is reached. */
  async fetchAllPages<T>(
    fetchPage: (offset: number, limit: number) => Promise<Paginated<T>>,
    pageSize = 500,
    maxItems = 5_000,
  ): Promise<T[]> {
    const items: T[] = [];
    let offset = 0;

    while (items.length < maxItems) {
      const page = await fetchPage(offset, pageSize);
      items.push(...page.items);
      if (!page.has_more || page.items.length === 0) break;
      offset += page.limit;
    }

    return items.slice(0, maxItems);
  }

  async health(): Promise<{ ok: boolean; service?: string }> {
    try {
      return await this.get('/health');
    } catch (err) {
      logKeeperWarn(this.logger, 'indexer health check failed', err);
      return { ok: false };
    }
  }

  async fetchProtocol(): Promise<ProtocolSettings | null> {
    try {
      return await this.get<ProtocolSettings>('/v1/protocol', { retries: 3 });
    } catch (err) {
      logKeeperWarn(this.logger, 'indexer protocol fetch failed', err);
      return null;
    }
  }

  fetchPositions(args?: {
    status?: string;
    minBorrowQuote?: number;
    minOpenQuantity?: number;
    maxExpiryMs?: number;
    hasPredictManager?: boolean;
    hasMargin?: boolean;
    excludeStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<LeveragedPosition>> {
    return this.get(
      `/v1/positions${this.buildQuery({
        status: args?.status ?? 'open',
        min_borrow_quote: args?.minBorrowQuote,
        min_open_quantity: args?.minOpenQuantity,
        max_expiry_ms: args?.maxExpiryMs,
        has_predict_manager: args?.hasPredictManager,
        has_margin: args?.hasMargin,
        exclude_status: args?.excludeStatus,
        limit: args?.limit ?? 500,
        offset: args?.offset ?? 0,
      })}`,
    );
  }

  /** Open keys with posted margin plus any keys with residual vault borrow. */
  async fetchLiquidationCandidates(): Promise<LeveragedPosition[]> {
    const [withMargin, withBorrow] = await Promise.all([
      this.fetchAllPages((offset, pageSize) =>
        this.fetchPositions({
          status: 'open',
          hasMargin: true,
          hasPredictManager: true,
          excludeStatus: 'liquidated',
          limit: pageSize,
          offset,
        }),
      ),
      this.fetchAllPages((offset, pageSize) =>
        this.fetchPositions({
          status: 'all',
          minBorrowQuote: 1,
          hasPredictManager: true,
          excludeStatus: 'liquidated',
          limit: pageSize,
          offset,
        }),
      ),
    ]);

    const seen = new Set<string>();
    const merged: LeveragedPosition[] = [];
    for (const position of [...withMargin, ...withBorrow]) {
      const key = `${position.account_id}:${position.position_key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(position);
    }
    return merged;
  }

  fetchLimitOrders(args?: {
    status?: string;
    minOrderExpiresMs?: number;
    maxOrderExpiresMs?: number;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<LimitMintOrder>> {
    return this.get(
      `/v1/limit-orders${this.buildQuery({
        status: args?.status ?? 'open',
        min_order_expires_ms: args?.minOrderExpiresMs,
        max_order_expires_ms: args?.maxOrderExpiresMs,
        limit: args?.limit ?? 500,
        offset: args?.offset ?? 0,
      })}`,
    );
  }

  fetchAccounts(args?: {
    owner?: string;
    accountId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<UserProxy>> {
    return this.get(
      `/v1/accounts${this.buildQuery({
        owner: args?.owner,
        account_id: args?.accountId,
        limit: args?.limit ?? 20,
        offset: args?.offset ?? 0,
      })}`,
    );
  }

  fetchAccount(accountId: string): Promise<{
    account: UserProxy | null;
    open_positions: LeveragedPosition[];
    open_limit_orders: LimitMintOrder[];
  }> {
    return this.get(`/v1/accounts/${accountId}`);
  }

  fetchExecutors(args?: {
    accountId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<ProxyExecutor>> {
    return this.get(
      `/v1/executors${this.buildQuery({
        account_id: args?.accountId,
        limit: args?.limit ?? 20,
        offset: args?.offset ?? 0,
      })}`,
    );
  }

  fetchOrderBook(args: {
    oracleId: string;
    expiryMs: number;
    strike: number;
    higherStrike?: number;
    isUp?: boolean;
    isRange?: boolean;
  }): Promise<OrderBookResponse> {
    return this.get(
      `/v1/orderbook${this.buildQuery({
        oracle_id: args.oracleId,
        expiry_ms: args.expiryMs,
        strike: args.strike,
        higher_strike: args.higherStrike ?? 0,
        is_up: args.isUp ?? true,
        is_range: args.isRange ?? false,
      })}`,
    );
  }

  fetchEvents(args?: {
    eventType?: string;
    limit?: number;
  }): Promise<Paginated<LeverxEvent>> {
    return this.get(
      `/v1/events${this.buildQuery({
        event_type: args?.eventType,
        limit: args?.limit ?? 500,
        offset: 0,
      })}`,
    );
  }

  /** Active take-profit / stop-loss triggers from the indexed `position_triggers` table. */
  fetchActiveTriggers(args?: {
    accountId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<PositionTrigger>> {
    return this.get(
      `/v1/triggers${this.buildQuery({
        account_id: args?.accountId,
        limit: args?.limit ?? 500,
        offset: args?.offset ?? 0,
      })}`,
    );
  }
}
