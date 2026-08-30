import { serverSchema, clientSchema } from "../src/env.schema.js";

export type EnvCheckIssue = {
  key: string;
  message: string;
};

export type EnvCheckResult = {
  ok: boolean;
  issues: EnvCheckIssue[];
};

type EnvCheckMode = "runtime" | "production";

function isTruthy(value: unknown): boolean {
  return value === true || value === "true";
}

function sameUrl(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString();
  };

  return normalize(left) === normalize(right);
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function productionOnlyIssues(env: Record<string, unknown>): EnvCheckIssue[] {
  const issues: EnvCheckIssue[] = [];

  if (isTruthy(env["AUTH_DEV_PHONE_BYPASS_ENABLED"])) {
    issues.push({
      key: "AUTH_DEV_PHONE_BYPASS_ENABLED",
      message: "must be disabled outside local development",
    });
  }

  if (hasValue(env["E2E_TEST_SECRET"])) {
    issues.push({
      key: "E2E_TEST_SECRET",
      message: "must not be configured in production",
    });
  }

  if (hasValue(env["KCLUB_ALLOW_PRODUCTION_DB"])) {
    issues.push({
      key: "KCLUB_ALLOW_PRODUCTION_DB",
      message:
        "is the incident-shell escape hatch (ADR 0026) and must never be configured in a deployment",
    });
  }

  if (hasValue(env["ADMIN_BOOTSTRAP_OWNER_PASSWORD"])) {
    issues.push({
      key: "ADMIN_BOOTSTRAP_OWNER_PASSWORD",
      message: "must be removed after the first staff owner is bootstrapped",
    });
  }

  if (!hasValue(env["STRIPE_VIP_PRICE_ID"])) {
    issues.push({
      key: "STRIPE_VIP_PRICE_ID",
      message: "is required before selling VIP subscriptions",
    });
  }

  if (!hasValue(env["STRIPE_BUSINESS_PRICE_ID"])) {
    issues.push({
      key: "STRIPE_BUSINESS_PRICE_ID",
      message: "is required before selling business subscriptions",
    });
  }

  const stripeSecret = env["STRIPE_SECRET_KEY"];
  if (typeof stripeSecret === "string" && stripeSecret.startsWith("sk_test_")) {
    issues.push({
      key: "STRIPE_SECRET_KEY",
      message: "must be a live key for production",
    });
  }

  const stripePublic = env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"];
  if (typeof stripePublic === "string" && stripePublic.startsWith("pk_test_")) {
    issues.push({
      key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      message: "must be a live key for production",
    });
  }

  return issues;
}

function sharedIssues(env: Record<string, unknown>): EnvCheckIssue[] {
  const issues: EnvCheckIssue[] = [];
  const appUrl = env["NEXT_PUBLIC_APP_URL"];
  const authUrl = env["BETTER_AUTH_URL"];

  if (
    typeof appUrl === "string" &&
    typeof authUrl === "string" &&
    !sameUrl(appUrl, authUrl)
  ) {
    issues.push({
      key: "BETTER_AUTH_URL",
      message: "must match NEXT_PUBLIC_APP_URL",
    });
  }

  return issues;
}

export function checkProductionEnv(
  env: Record<string, unknown>,
  mode: EnvCheckMode = "runtime",
): EnvCheckResult {
  const envToValidate =
    mode === "production" ? { ...env, VERCEL_ENV: "production" } : env;
  const serverResult = serverSchema.safeParse(envToValidate);
  const clientResult = clientSchema.safeParse(envToValidate);
  const issues: EnvCheckIssue[] = [];

  if (!serverResult.success) {
    for (const issue of serverResult.error.issues) {
      issues.push({
        key: issue.path.join("."),
        message: issue.message,
      });
    }
  }

  if (!clientResult.success) {
    for (const issue of clientResult.error.issues) {
      issues.push({
        key: issue.path.join("."),
        message: issue.message,
      });
    }
  }

  issues.push(...sharedIssues(envToValidate));

  if (envToValidate["VERCEL_ENV"] === "production") {
    issues.push(...productionOnlyIssues(envToValidate));
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function main() {
  const result = checkProductionEnv(process.env, "production");

  if (result.ok) {
    console.log("production environment check passed");
    return;
  }

  console.error("production environment check failed:");
  for (const issue of result.issues) {
    console.error(`  ${issue.key}: ${issue.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith("check-production-env.ts")) {
  main();
}
