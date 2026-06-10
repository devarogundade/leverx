import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeeperConfig } from '../config/keeper.config';
import type {
  LeveragedPosition,
  LeverxEvent,
  LimitMintOrder,
  OrderBookResponse,
  Paginated,
  PositionTrigger,
  ProtocolSettings,
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

  fetchProtocol(): Promise<ProtocolSettings | null> {
    return this.get('/v1/protocol');
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
  async fetchLiquidationCandidates(limit = 500): Promise<LeveragedPosition[]> {
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
      if (merged.length >= limit) break;
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
