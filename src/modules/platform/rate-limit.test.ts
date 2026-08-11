import { describe, it, expect } from "vitest";
import {
  inMemoryRateLimiter,
  assertRateLimit,
  redisRestRateLimiter,
} from "./rate-limit";
import { RateLimited } from "../../domain/errors";

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

describe("redisRestRateLimiter", () => {
  function commandFromBody(body: BodyInit | null | undefined) {
    if (typeof body !== "string") {
      throw new Error("Expected JSON string body");
    }
    return JSON.parse(body) as string[];
  }

  it("FR-024 applies a fixed-window Redis limit", async () => {
    const calls: string[][] = [];
    const fetchImpl = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      await Promise.resolve();
      const command = commandFromBody(init?.body);
      calls.push(command);
      const name = command[0];

      if (name === "INCR") {
        return Response.json({ result: 31 });
      }
      if (name === "PTTL") {
        return Response.json({ result: 42_000 });
      }
      return Response.json({ result: "OK" });
    };

    const limiter = redisRestRateLimiter(
      "https://redis.example.com",
      "token",
      fetchImpl,
    );

    const result = await limiter.check("card:ip:203.0.113.10", 30, 60_000);

    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      resetMs: 42_000,
    });
    expect(calls).toEqual([
      ["INCR", "rate:card:ip:203.0.113.10"],
      ["PTTL", "rate:card:ip:203.0.113.10"],
    ]);
  });

  it("FR-024 sets expiry when opening a Redis window", async () => {
    const calls: string[][] = [];
    const fetchImpl = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      await Promise.resolve();
      const command = commandFromBody(init?.body);
      calls.push(command);
      const name = command[0];

      if (name === "INCR") {
        return Response.json({ result: 1 });
      }
      if (name === "PTTL") {
        return Response.json({ result: 60_000 });
      }
      return Response.json({ result: "OK" });
    };

    const limiter = redisRestRateLimiter(
      "https://redis.example.com",
      "token",
      fetchImpl,
    );

    const result = await limiter.check("card:ip:203.0.113.10", 30, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
    expect(calls).toEqual([
      ["INCR", "rate:card:ip:203.0.113.10"],
      ["PEXPIRE", "rate:card:ip:203.0.113.10", "60000"],
      ["PTTL", "rate:card:ip:203.0.113.10"],
    ]);
  });
});
