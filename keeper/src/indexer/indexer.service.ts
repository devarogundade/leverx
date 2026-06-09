import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeeperConfig } from '../config/keeper.config';
import type {
  LeveragedPosition,
  LeverxEvent,
  LimitMintOrder,
  OrderBookResponse,
  Paginated,
  TriggerState,
  UserProxy,
} from './indexer.types';

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

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`indexer ${path}: ${res.status} ${body}`);
    }
    return res.json() as Promise<T>;
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
      this.logger.warn(`indexer health check failed: ${String(err)}`);
      return { ok: false };
    }
  }

  fetchPositions(args?: {
    status?: string;
    minBorrowQuote?: number;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<LeveragedPosition>> {
    return this.get(
      `/v1/positions${this.buildQuery({
        status: args?.status ?? 'open',
        min_borrow_quote: args?.minBorrowQuote,
        limit: args?.limit ?? 500,
        offset: args?.offset ?? 0,
      })}`,
    );
  }

  /** Keys with outstanding per-position debt (open or closed predict leg). */
  fetchLiquidationCandidates(limit = 500): Promise<Paginated<LeveragedPosition>> {
    return this.fetchPositions({
      status: 'all',
      minBorrowQuote: 1,
      limit,
    });
  }

  fetchLimitOrders(args?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<LimitMintOrder>> {
    return this.get(
      `/v1/limit-orders${this.buildQuery({
        status: args?.status ?? 'open',
        limit: args?.limit ?? 500,
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
  }): Promise<Paginated<TriggerState>> {
    return this.get(
      `/v1/triggers${this.buildQuery({
        account_id: args?.accountId,
        limit: args?.limit ?? 500,
        offset: args?.offset ?? 0,
      })}`,
    );
  }
}
