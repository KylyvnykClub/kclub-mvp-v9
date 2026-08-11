import * as Sentry from "@sentry/nextjs";

if (!Sentry.isInitialized()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",

    // Sample 100% of errors, 10% of transactions in production.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Do not send PII: no usernames, emails, or IPs.
    sendDefaultPii: false,

    ignoreErrors: [
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
      /AbortError/,
      /ECONNRESET/,
    ],

    beforeSend(event) {
      const json = JSON.stringify(event);
      if (/\+\d{10,15}/.test(json)) {
        const redacted = json.replace(/\+\d{10,15}/g, "+[REDACTED]");
        return JSON.parse(redacted) as typeof event;
      }

      return event;
    },
  });
}
