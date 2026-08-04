/**
 * Sentry server-side configuration (fallback).
 *
 * The primary initialization happens in src/instrumentation.ts.
 * This file exists as a fallback for edge cases where the instrumentation
 * hook does not run.
 *
 * See: docs/observability.md §2 (Errors → Sentry)
 */

import * as Sentry from "@sentry/nextjs";

if (!Sentry.isInitialized()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
