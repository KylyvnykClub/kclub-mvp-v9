import { describe, expect, it } from "vitest";

import { clientSchema, serverSchema } from "@/env.schema.js";

/**
 * The production superRefine rules in env.schema.ts are fail-closed guards: a
 * secret whose absence would otherwise surface as an invisible non-delivery (or
 * a locked-out staff, or an undefended registration form) must instead fail at
 * boot. These tests pin the RESEND_API_KEY guard specifically, because without
 * it sendEmail returns false and the outbox row is marked processed all the
 * same - the FR-056 dunning notices silently never reach the member.
 */

/** A minimal env that parses cleanly for VERCEL_ENV=production. */
function productionBase(): Record<string, string> {
  return {
    VERCEL_ENV: "production",
    DATABASE_URL: "postgres://user:pass@host/db",
    DATABASE_URL_DIRECT: "postgres://user:pass@host/db",
    BETTER_AUTH_SECRET: "better-auth-secret",
    STRIPE_SECRET_KEY: "sk_live_stub",
    STRIPE_WEBHOOK_SECRET: "whsec_stub",
    STRIPE_VIP_PRICE_ID: "price_vip_live",
    STRIPE_LISTING_PRICE_ID: "price_listing_live",
    UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "redis-token",
    CRON_SECRET: "cron-secret",
    TOTP_ENCRYPTION_KEY: "test-test-test-test-test-test-test!",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    RESEND_API_KEY: "re_stub",
  };
}

describe("constraint: production fail-closed env (FR-056)", () => {
  it("rejects a production deploy that is missing RESEND_API_KEY", () => {
    const { RESEND_API_KEY: _omitted, ...withoutResend } = productionBase();

    const result = serverSchema.safeParse(withoutResend);

    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find(
      (i) => i.path[0] === "RESEND_API_KEY",
    );
    expect(issue?.message).toBe("RESEND_API_KEY is required in production");
  });

  it("accepts a production deploy once RESEND_API_KEY is present", () => {
    const result = serverSchema.safeParse(productionBase());

    expect(result.success).toBe(true);
  });

  it("does not require RESEND_API_KEY outside production", () => {
    const { RESEND_API_KEY: _omitted, ...base } = productionBase();

    for (const vercelEnv of ["preview", "development"] as const) {
      const result = serverSchema.safeParse({
        ...base,
        VERCEL_ENV: vercelEnv,
      });
      expect(result.success, `VERCEL_ENV=${vercelEnv} should parse`).toBe(true);
    }
  });

  it("rejects production Stripe test mode and missing checkout prices", () => {
    const {
      STRIPE_VIP_PRICE_ID: _vipPrice,
      STRIPE_LISTING_PRICE_ID: _listingPrice,
      ...base
    } = productionBase();

    const result = serverSchema.safeParse({
      ...base,
      STRIPE_SECRET_KEY: "sk_test_stub",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.map((issue) => [issue.path[0], issue.message]),
    ).toEqual(
      expect.arrayContaining([
        [
          "STRIPE_SECRET_KEY",
          "STRIPE_SECRET_KEY must be a live key in production",
        ],
        [
          "STRIPE_VIP_PRICE_ID",
          "STRIPE_VIP_PRICE_ID is required in production",
        ],
        [
          "STRIPE_LISTING_PRICE_ID",
          "STRIPE_LISTING_PRICE_ID is required in production",
        ],
      ]),
    );
  });

  it("rejects a production publishable Stripe test key", () => {
    const result = clientSchema.safeParse({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_stub",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
        message:
          "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live key in production",
      }),
    );
  });
});
