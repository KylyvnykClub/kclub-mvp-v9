import { RateLimited } from "../../domain/errors";

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

type FetchLike = typeof fetch;

interface RedisRestResponse<T> {
  result?: T;
  error?: string;
}

async function redisCommand<T>(
  url: string,
  token: string,
  command: string[],
  fetchImpl: FetchLike,
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Redis REST command failed with ${response.status}`);
  }

  const body = (await response.json()) as RedisRestResponse<T>;
  if (body.error || body.result === undefined) {
    throw new Error(body.error ?? "Redis REST command returned no result");
  }

  return body.result;
}

export function redisRestRateLimiter(
  url: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): RateLimiter {
  return {
    async check(key, limit, windowMs): Promise<RateLimitResult> {
      const redisKey = `rate:${key}`;
      const count = await redisCommand<number>(
        url,
        token,
        ["INCR", redisKey],
        fetchImpl,
      );

      if (count === 1) {
        await redisCommand<string>(
          url,
          token,
          ["PEXPIRE", redisKey, String(windowMs)],
          fetchImpl,
        );
      }

      const ttlMs = await redisCommand<number>(
        url,
        token,
        ["PTTL", redisKey],
        fetchImpl,
      );
      const resetMs = ttlMs > 0 ? ttlMs : windowMs;

      if (count > limit) {
        return { allowed: false, remaining: 0, resetMs };
      }

      return {
        allowed: true,
        remaining: Math.max(0, limit - count),
        resetMs,
      };
    },
  };
}

/**
 * The limiter the authentication actions use.
 *
 * Redis where it is configured, in-memory otherwise. The fallback is not a
 * silent downgrade to nothing: a single instance still refuses a burst, which
 * is what a password-guessing loop looks like. It is per-instance, so it does
 * not hold across a serverless fleet — that is what the Redis path is for, and
 * production requires those variables.
 */
export function authRateLimiter(): RateLimiter {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];

  return url && token ? redisRestRateLimiter(url, token) : sharedInMemory;
}

// One map for the lifetime of the instance. A limiter constructed per call
// would start every request with an empty window and limit nothing at all.
const sharedInMemory = inMemoryRateLimiter();
