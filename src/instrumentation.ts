export async function register(): Promise<void> {
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
