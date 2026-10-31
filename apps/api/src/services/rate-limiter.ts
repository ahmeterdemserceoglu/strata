export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * In-memory Token Bucket rate limiter (suitable for single-node development & testing;
 * cluster mode integrates with Redis Lua script).
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  public check(key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = Date.now();
    const refillRate = limit / (windowSeconds * 1000); // tokens per ms

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.lastRefill;
      bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      const remaining = Math.floor(bucket.tokens);
      return {
        allowed: true,
        limit,
        remaining,
        resetSeconds: Math.ceil((limit - bucket.tokens) / (refillRate * 1000))
      };
    } else {
      const resetSeconds = Math.ceil((1 - bucket.tokens) / (refillRate * 1000));
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetSeconds: Math.max(1, resetSeconds)
      };
    }
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }
}

export const globalRateLimiter = new RateLimiter();
