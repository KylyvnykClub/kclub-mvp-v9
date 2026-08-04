import { describe, it, expect } from "vitest";
import { inMemoryRateLimiter, assertRateLimit } from "./rate-limit.js";
import { RateLimited } from "../../domain/errors.js";

describe("inMemoryRateLimiter", () => {
  it("allows requests within the limit", async () => {
    const limiter = inMemoryRateLimiter();
    const r1 = await limiter.check("ip:1.2.3.4", 3, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await limiter.check("ip:1.2.3.4", 3, 60_000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await limiter.check("ip:1.2.3.4", 3, 60_000);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("denies requests over the limit", async () => {
    const limiter = inMemoryRateLimiter();
    await limiter.check("ip:x", 1, 60_000);
    const r2 = await limiter.check("ip:x", 1, 60_000);
    expect(r2.allowed).toBe(false);
    expect(r2.remaining).toBe(0);
  });

  it("uses separate windows per key", async () => {
    const limiter = inMemoryRateLimiter();
    await limiter.check("a", 1, 60_000);
    const r = await limiter.check("b", 1, 60_000);
    expect(r.allowed).toBe(true);
  });
});

describe("assertRateLimit", () => {
  it("does not throw when allowed", async () => {
    const limiter = inMemoryRateLimiter();
    await expect(
      assertRateLimit(limiter, "k", 5, 60_000),
    ).resolves.toBeUndefined();
  });

  it("throws RateLimited when over limit", async () => {
    const limiter = inMemoryRateLimiter();
    await limiter.check("k", 1, 60_000);
    await expect(assertRateLimit(limiter, "k", 1, 60_000)).rejects.toThrow(
      RateLimited,
    );
  });
});
