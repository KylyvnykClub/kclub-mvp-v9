import { describe, expect, it } from "vitest";

import { checkProductionEnv } from "../../tools/check-production-env";

const baseProductionEnv = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://kclub.com",
  DATABASE_URL: "postgres://pooled.example/kclub",
  DATABASE_URL_DIRECT: "postgres://direct.example/kclub",
  BETTER_AUTH_SECRET: "production-secret",
  BETTER_AUTH_URL: "https://kclub.com",
  // Phone verification is postponed (ADR 0012), so Twilio is absent and
  // Turnstile carries the registration bot gate instead.
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  STRIPE_SECRET_KEY: "sk_live_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  STRIPE_VIP_PRICE_ID: "price_vip",
  STRIPE_LISTING_PRICE_ID: "price_listing",
  CRON_SECRET: "cron-secret",
  UPSTASH_REDIS_REST_URL: "https://redis.example",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
};

describe("constraint: production environment check", () => {
  it("accepts a production-shaped environment", () => {
    expect(checkProductionEnv(baseProductionEnv, "production")).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("rejects production dev bypass and test-only secrets", () => {
    const result = checkProductionEnv(
      {
        ...baseProductionEnv,
        AUTH_DEV_PHONE_BYPASS_ENABLED: "true",
        E2E_TEST_SECRET: "test-secret",
        ADMIN_BOOTSTRAP_OWNER_PASSWORD: "bootstrap-password",
      },
      "production",
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining([
        "AUTH_DEV_PHONE_BYPASS_ENABLED",
        "E2E_TEST_SECRET",
        "ADMIN_BOOTSTRAP_OWNER_PASSWORD",
      ]),
    );
  });

  it("rejects production Stripe test keys and missing price ids", () => {
    const result = checkProductionEnv(
      {
        ...baseProductionEnv,
        STRIPE_SECRET_KEY: "sk_test_123",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
        STRIPE_VIP_PRICE_ID: "",
        STRIPE_LISTING_PRICE_ID: "",
      },
      "production",
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining([
        "STRIPE_SECRET_KEY",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "STRIPE_VIP_PRICE_ID",
        "STRIPE_LISTING_PRICE_ID",
      ]),
    );
  });

  it("rejects mismatched public and auth URLs", () => {
    const result = checkProductionEnv(
      {
        ...baseProductionEnv,
        BETTER_AUTH_URL: "https://auth.kclub.com",
      },
      "production",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      key: "BETTER_AUTH_URL",
      message: "must match NEXT_PUBLIC_APP_URL",
    });
  });

  it("treats the CLI mode as production even when VERCEL_ENV is absent", () => {
    const { VERCEL_ENV: _vercelEnv, ...envWithoutVercelEnv } =
      baseProductionEnv;

    const result = checkProductionEnv(
      {
        ...envWithoutVercelEnv,
        STRIPE_SECRET_KEY: "sk_test_123",
      },
      "production",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      key: "STRIPE_SECRET_KEY",
      message: "must be a live key for production",
    });
  });
});
