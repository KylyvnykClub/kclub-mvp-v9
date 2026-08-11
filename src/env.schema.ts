import { z } from "zod";

/**
 * Zod schemas for every environment variable the application needs.
 *
 * This file is the single source of truth:
 *   - src/env.ts imports these schemas and validates eagerly at boot
 *   - tools/gen-env-example.ts imports them to generate .env.example
 *
 * Variables are grouped by the service they belong to. A variable that is
 * only needed in production (or only in development) carries a .default()
 * so that its absence does not block the other environment.
 */

export const serverSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),

    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

    // ── Database — PostgreSQL on Neon (via Drizzle) ─────────
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_DIRECT: z.string().min(1),

    // ── Authentication — better-auth (self-hosted) ──────────
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),

    // ── Staff auth bootstrap ────────────────────────────────
    ADMIN_BOOTSTRAP_OWNER_PHONE: z.string().optional(),
    ADMIN_BOOTSTRAP_OWNER_PASSWORD: z.string().optional(),

    TOTP_ENCRYPTION_KEY: z.string().optional(),

    // ── SMS — Twilio Verify ─────────────────────────────────
    TWILIO_ACCOUNT_SID: z.string().min(1),
    TWILIO_AUTH_TOKEN: z.string().min(1),
    TWILIO_VERIFY_SERVICE_SID: z.string().min(1),

    // ── Billing — Stripe ────────────────────────────────────
    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    NEXT_PUBLIC_STRIPE_VIP_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_LISTING_PRICE_ID: z.string().optional(),

    // ── Cron ────────────────────────────────────────────────
    CRON_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),

    // ── Background jobs — Inngest ───────────────────────────
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),

    // ── Rate limiting — Upstash Redis ───────────────────────
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

    // ── Email — Resend ──────────────────────────────────────
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("KCLUB <hello@kclub.com>"),

    // ── Object storage — Cloudflare R2 ──────────────────────
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().default("kclub"),

    // ── Bot defense — Cloudflare Turnstile ──────────────────
    TURNSTILE_SECRET_KEY: z.string().optional(),

    // ── Observability — Sentry ──────────────────────────────
    SENTRY_DSN: z.string().optional(),

    // ── Dev flags ───────────────────────────────────────────
    AUTH_DEV_PHONE_BYPASS_ENABLED: z
      .enum(["true", "false", ""])
      .default("")
      .transform((v) => v === "true"),
    E2E_TEST_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.VERCEL_ENV === "production" && !env.CRON_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["CRON_SECRET"],
        message: "CRON_SECRET is required in production",
      });
    }
  });

export const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  NEXT_PUBLIC_STRIPE_VIP_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_STRIPE_LISTING_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});
