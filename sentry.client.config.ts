/**
 * Sentry client-side configuration.
 *
 * Loaded automatically by @sentry/nextjs when the browser bundle starts.
 * See: docs/observability.md §2 (Errors → Sentry)
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local",

  // 10% of transactions in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Replay only on errors, 0% session replay
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,

  // No PII
  sendDefaultPii: false,

  // Ignore browser noise
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    /ChunkLoadError/,
    /NEXT_NOT_FOUND/,
    /NEXT_REDIRECT/,
  ],

  integrations: [Sentry.browserTracingIntegration()],
});
