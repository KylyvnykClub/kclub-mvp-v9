/**
 * Next.js Instrumentation Hook.
 *
 * Initializes Sentry for server-side error tracking.
 * This file is loaded once when the Next.js server starts.
 *
 * See: docs/observability.md §2 (Errors → Sentry)
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",

      // Sample 100% of errors, 10% of transactions (per observability.md §5)
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

      // Don't send PII — no usernames, emails, IPs
      sendDefaultPii: false,

      // Ignore expected client errors
      ignoreErrors: [
        "NEXT_NOT_FOUND",
        "NEXT_REDIRECT",
        /AbortError/,
        /ECONNRESET/,
      ],

      beforeSend(event) {
        // Strip any accidentally included phone numbers (E.164 pattern)
        const json = JSON.stringify(event);
        if (/\+\d{10,15}/.test(json)) {
          // Redact — replace phone-like patterns
          const redacted = json.replace(/\+\d{10,15}/g, "+[REDACTED]");
          return JSON.parse(redacted) as typeof event;
        }
        return event;
      },
    });
  }
}
