import { Logger } from '@nestjs/common';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { isSuiRpcRateLimitError, isSuiRpcTransientError } from './sui-rpc-errors';

export { isSuiRpcRateLimitError, isSuiRpcTransientError } from './sui-rpc-errors';

/** How long to stay on fallback RPC before trying the public node again. */
export const SUI_RPC_FALLBACK_REST_MS = 60_000;

/** Default spacing between RPC calls (~4/s — under BlockVision free tier). */
export const SUI_RPC_DEFAULT_MAX_PER_SECOND = 4;

export const SUI_RPC_DEFAULT_MAX_RETRIES = 6;
export const SUI_RPC_DEFAULT_RETRY_BASE_MS = 300;
export const SUI_RPC_DEFAULT_RETRY_MAX_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Spaces out RPC calls to avoid bursting past provider rate limits. */
export class RpcRateLimiter {
  private lastCallMs = 0;

  constructor(private readonly minIntervalMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const wait = this.lastCallMs + this.minIntervalMs - now;
    if (wait > 0) {
      await sleep(wait);
    }
    this.lastCallMs = Date.now();
  }
}

export type SuiRpcFailoverOptions = {
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
  primaryUrl: string;
  fallbackUrl?: string;
  restMs?: number;
  maxPerSecond?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  logger?: Logger;
};

export type SuiRpcEndpointState = {
  active: 'primary' | 'fallback';
  primaryUrl: string;
  fallbackUrl: string | null;
  fallbackRestMs: number;
  fallbackUntilMs: number | null;
};

export class SuiRpcFailover {
  private readonly primaryClient: SuiJsonRpcClient;
  private readonly fallbackClient: SuiJsonRpcClient | null;
  private readonly primaryUrl: string;
  private readonly fallbackUrl: string | null;
  private readonly restMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly limiter: RpcRateLimiter;
  private readonly logger?: Logger;
  private active: 'primary' | 'fallback' = 'primary';
  private fallbackUntilMs: number | null = null;

  constructor(options: SuiRpcFailoverOptions) {
    const network = options.network;
    this.primaryUrl = options.primaryUrl || getJsonRpcFullnodeUrl(network);
    this.fallbackUrl = options.fallbackUrl?.trim() || null;
    this.restMs = options.restMs ?? SUI_RPC_FALLBACK_REST_MS;
    this.maxRetries = options.maxRetries ?? SUI_RPC_DEFAULT_MAX_RETRIES;
    this.retryBaseMs = options.retryBaseMs ?? SUI_RPC_DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = options.retryMaxMs ?? SUI_RPC_DEFAULT_RETRY_MAX_MS;
    const maxPerSecond = options.maxPerSecond ?? SUI_RPC_DEFAULT_MAX_PER_SECOND;
    this.limiter = new RpcRateLimiter(Math.ceil(1000 / Math.max(1, maxPerSecond)));
    this.logger = options.logger;

    this.primaryClient = new SuiJsonRpcClient({
      url: this.primaryUrl,
      network,
    });
    this.fallbackClient = this.fallbackUrl
      ? new SuiJsonRpcClient({ url: this.fallbackUrl, network })
      : null;

    if (this.fallbackClient) {
      this.logger?.log(
        `Sui RPC failover enabled: primary=${this.redactUrl(this.primaryUrl)} fallback=${this.redactUrl(this.fallbackUrl!)} rest=${this.restMs}ms throttle=${maxPerSecond}/s`,
      );
    } else {
      this.logger?.log(
        `Sui RPC: ${this.redactUrl(this.primaryUrl)} throttle=${maxPerSecond}/s (no fallback)`,
      );
    }
  }

  getState(): SuiRpcEndpointState {
    return {
      active: this.active,
      primaryUrl: this.primaryUrl,
      fallbackUrl: this.fallbackUrl,
      fallbackRestMs: this.restMs,
      fallbackUntilMs: this.fallbackUntilMs,
    };
  }

  getActiveClient(): SuiJsonRpcClient {
    this.maybeSwitchBackToPrimary();
    return this.active === 'fallback' && this.fallbackClient
      ? this.fallbackClient
      : this.primaryClient;
  }

  async invoke<T>(fn: (client: SuiJsonRpcClient) => Promise<T>): Promise<T> {
    let lastErr: unknown;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      await this.limiter.acquire();
      this.maybeSwitchBackToPrimary();

      try {
        return await fn(this.getActiveClient());
      } catch (err) {
        lastErr = err;
        if (!isSuiRpcTransientError(err)) {
          throw err;
        }

        if (this.active === 'primary' && this.fallbackClient && isSuiRpcRateLimitError(err)) {
          this.switchToFallback();
          continue;
        }

        const backoff = Math.min(
          this.retryBaseMs * 2 ** attempt,
          this.retryMaxMs,
        );
        this.logger?.warn(
          `Sui RPC rate limited (${this.active}) — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
        );
        await sleep(backoff);
      }
    }

    throw lastErr;
  }

  private switchToFallback(): void {
    if (!this.fallbackClient || !this.fallbackUrl) return;
    this.active = 'fallback';
    this.fallbackUntilMs = Date.now() + this.restMs;
    this.logger?.warn(
      `Sui RPC rate limited on primary — using fallback for ${this.restMs}ms (${this.redactUrl(this.fallbackUrl)})`,
    );
  }

  private maybeSwitchBackToPrimary(): void {
    if (this.active !== 'fallback' || this.fallbackUntilMs === null) return;
    if (Date.now() < this.fallbackUntilMs) return;

    this.active = 'primary';
    this.fallbackUntilMs = null;
    this.logger?.log(
      `Sui RPC fallback rest complete — switching back to primary (${this.redactUrl(this.primaryUrl)})`,
    );
  }

  private redactUrl(url: string): string {
    return url.replace(/\/v1\/[^/]+$/i, '/v1/***');
  }
}
