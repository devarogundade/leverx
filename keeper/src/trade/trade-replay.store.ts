import { Injectable } from '@nestjs/common';

/** In-memory replay cache for signed trade intents (signature → expiry). */
@Injectable()
export class TradeReplayStore {
  private readonly used = new Map<string, number>();

  isReplayed(signature: string, nowMs = Date.now()): boolean {
    this.prune(nowMs);
    const expiresAt = this.used.get(signature.trim());
    return expiresAt !== undefined && expiresAt >= nowMs;
  }

  markUsed(signature: string, expiresAtMs: number): void {
    this.used.set(signature.trim(), expiresAtMs);
  }

  private prune(nowMs: number): void {
    for (const [sig, expiresAt] of this.used) {
      if (expiresAt < nowMs) this.used.delete(sig);
    }
  }
}
