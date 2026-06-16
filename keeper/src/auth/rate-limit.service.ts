import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  /** Returns true when the request is within the limit. */
  allow(key: string, limit: number, windowMs: number, nowMs = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      this.buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  assertAllowed(key: string, limit: number, windowMs: number): void {
    if (!this.allow(key, limit, windowMs)) {
      throw new HttpException('rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
