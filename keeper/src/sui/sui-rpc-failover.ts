import { Logger } from '@nestjs/common';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

/** How long to stay on fallback RPC before trying the public node again. */
export const SUI_RPC_FALLBACK_REST_MS = 60_000;

export function isSuiRpcRateLimitError(err: unknown): boolean {
  const message = String(err ?? '').toLowerCase();
  if (message.includes('429') || message.includes('rate limit')) return true;
  if (message.includes('too many requests')) return true;
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status?: number }).status);
    if (status === 429) return true;
  }
  return false;
}

export type SuiRpcFailoverOptions = {
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
  primaryUrl: string;
  fallbackUrl?: string;
  restMs?: number;
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
  private readonly logger?: Logger;
  private active: 'primary' | 'fallback' = 'primary';
  private fallbackUntilMs: number | null = null;

  constructor(options: SuiRpcFailoverOptions) {
    const network = options.network;
    this.primaryUrl = options.primaryUrl || getJsonRpcFullnodeUrl(network);
    this.fallbackUrl = options.fallbackUrl?.trim() || null;
    this.restMs = options.restMs ?? SUI_RPC_FALLBACK_REST_MS;
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
        `Sui RPC failover enabled: primary=${this.redactUrl(this.primaryUrl)} fallback=${this.redactUrl(this.fallbackUrl!)} rest=${this.restMs}ms`,
      );
    } else {
      this.logger?.log(`Sui RPC: ${this.redactUrl(this.primaryUrl)} (no fallback)`);
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
    this.maybeSwitchBackToPrimary();

    try {
      return await fn(this.getActiveClient());
    } catch (err) {
      if (!isSuiRpcRateLimitError(err) || !this.fallbackClient) {
        throw err;
      }

      if (this.active === 'fallback') {
        throw err;
      }

      this.switchToFallback();
      return await fn(this.fallbackClient);
    }
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
