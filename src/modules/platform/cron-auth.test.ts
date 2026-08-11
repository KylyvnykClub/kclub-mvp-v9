import { describe, expect, it } from "vitest";
import { serverSchema } from "@/env.schema";
import { authorizeCronRequest } from "./cron-auth";

function requestWithAuth(authorization?: string) {
  return new Request("https://kclub.test/api/cron/outbox-drain", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("authorizeCronRequest", () => {
  it("FR-058 fails closed when CRON_SECRET is not configured", () => {
    const response = authorizeCronRequest(requestWithAuth(), undefined);

    expect(response?.status).toBe(401);
  });

  it("FR-058 rejects missing and incorrect bearer tokens", () => {
    expect(authorizeCronRequest(requestWithAuth(), "secret")?.status).toBe(401);
    expect(
      authorizeCronRequest(requestWithAuth("Bearer wrong"), "secret")?.status,
    ).toBe(401);
  });

  it("FR-058 allows the exact configured bearer token", () => {
    const response = authorizeCronRequest(
      requestWithAuth("Bearer secret"),
      "secret",
    );

    expect(response).toBeNull();
  });
});

describe("serverSchema CRON_SECRET", () => {
  const baseEnv = {
    DATABASE_URL: "postgres://user:pass@example.com/db",
    DATABASE_URL_DIRECT: "postgres://user:pass@example.com/db",
    BETTER_AUTH_SECRET: "secret",
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_VERIFY_SERVICE_SID: "VA123",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_123",
    UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  };

  it("requires CRON_SECRET in production deployments", () => {
    const result = serverSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["CRON_SECRET"],
            message: "CRON_SECRET is required in production",
          }),
        ]),
      );
    }
  });

  it("allows CRON_SECRET to be omitted outside production", () => {
    const result = serverSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      CRON_SECRET: "",
    });

    expect(result.success).toBe(true);
  });
});
