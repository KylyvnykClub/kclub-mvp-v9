export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ADR 0026: read the database's environment marker before the first
    // request. A local process blocks on it and refuses a production marker;
    // a deployed one must never delay or fail a cold start, so it only logs.
    const { guardDatabaseEnvironment } =
      await import("./instrumentation-database");
    const deployed =
      process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL_ENV === "preview";
    if (deployed) {
      void guardDatabaseEnvironment().catch((error: unknown) => {
        console.warn("[database-environment] guard failed:", error);
      });
    } else {
      await guardDatabaseEnvironment();
    }
  }

  if (!process.env.SENTRY_DSN) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}

export const onRequestError = (async (
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  const Sentry = await import("@sentry/nextjs");
  return Sentry.captureRequestError(...args);
}) satisfies typeof import("@sentry/nextjs").captureRequestError;
