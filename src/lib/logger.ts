/**
 * Structured logger.
 *
 * Outputs JSON to stdout so that Vercel's log drain can send it to Axiom.
 * In development, outputs human-readable lines instead.
 *
 * Every log entry carries the fields required by observability.md §3:
 * timestamp, level, correlation_id, service, release, route, actor, duration, outcome.
 *
 * NEVER log: passwords, hashes, session ids, TOTP seeds, OTP codes,
 * QR tokens, full phone numbers, request bodies on auth routes,
 * Authorization/Cookie headers, or Stripe secret keys.
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogContext {
  correlationId?: string;
  route?: string;
  actorType?: "member" | "staff" | "system";
  actorId?: string;
  durationMs?: number;
  outcome?: "ok" | "client_error" | "server_error" | "degraded";
  event?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function parseLogLevel(value: string | undefined): LogLevel | null {
  if (
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug"
  ) {
    return value;
  }
  return null;
}

const CURRENT_LEVEL: LogLevel =
  parseLogLevel(process.env.LOG_LEVEL) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const IS_DEV = process.env.NODE_ENV !== "production";
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local";
const SERVICE = "kclub";

function logLevelValue(level: LogLevel): number {
  switch (level) {
    case "error":
      return LOG_LEVELS.error;
    case "warn":
      return LOG_LEVELS.warn;
    case "info":
      return LOG_LEVELS.info;
    case "debug":
      return LOG_LEVELS.debug;
  }
}

function shouldLog(level: LogLevel): boolean {
  return logLevelValue(level) <= logLevelValue(CURRENT_LEVEL);
}

function formatDev(level: LogLevel, message: string, ctx: LogContext): string {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `${ts} ${level.toUpperCase().padEnd(5)}`;
  const extras = Object.entries(ctx)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const rendered =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : JSON.stringify(v);
      return `${k}=${rendered}`;
    })
    .join(" ");
  return `${prefix} ${message}${extras ? ` | ${extras}` : ""}`;
}

function emit(level: LogLevel, message: string, ctx: LogContext = {}): void {
  if (!shouldLog(level)) return;

  if (IS_DEV) {
    const line = formatDev(level, message, ctx);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    // eslint-disable-next-line no-console
    else console.log(line);
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE,
    release: RELEASE,
    ...ctx,
  };

  const json = JSON.stringify(entry);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  // eslint-disable-next-line no-console
  else console.log(json);
}

export const logger = {
  error: (message: string, ctx?: LogContext) => emit("error", message, ctx),
  warn: (message: string, ctx?: LogContext) => emit("warn", message, ctx),
  info: (message: string, ctx?: LogContext) => emit("info", message, ctx),
  debug: (message: string, ctx?: LogContext) => emit("debug", message, ctx),
};
