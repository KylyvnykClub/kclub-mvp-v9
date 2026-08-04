import { RateLimited } from "../../domain/errors.js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export async function assertRateLimit(
  limiter: RateLimiter,
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const result = await limiter.check(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimited(`Rate limit exceeded for ${key}`, result.resetMs);
  }
}

export function inMemoryRateLimiter(): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key, limit, windowMs): Promise<RateLimitResult> {
      const now = Date.now();
      const entry = windows.get(key);

      if (!entry || now >= entry.resetAt) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return Promise.resolve({
          allowed: true,
          remaining: limit - 1,
          resetMs: windowMs,
        });
      }

      entry.count++;
      const remaining = Math.max(0, limit - entry.count);
      const resetMs = entry.resetAt - now;

      if (entry.count > limit) {
        return Promise.resolve({ allowed: false, remaining: 0, resetMs });
      }

      return Promise.resolve({ allowed: true, remaining, resetMs });
    },
  };
}
