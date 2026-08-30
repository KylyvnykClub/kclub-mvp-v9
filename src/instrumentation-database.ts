import type { DatabaseMarker } from "@/data/database-environment";
import type { Verdict } from "@/lib/database-environment-guard";

/**
 * The server-start half of ADR 0026: read the database's environment marker
 * once, before the first request, and refuse to serve a local process that
 * is pointed at production.
 *
 * `runDatabaseEnvironmentGuard` takes its effects as arguments so the
 * behaviour — what is printed, when the process exits, what a timeout means —
 * is unit-tested without Next.js or a database. `guardDatabaseEnvironment`
 * is the wiring `src/instrumentation.ts` calls.
 */

export interface GuardEffects {
  readMarker: () => Promise<DatabaseMarker>;
  env: Record<string, string | undefined>;
  /** Never returns in production wiring; returns in tests. */
  exit: (code: number) => void;
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

function isDeployed(env: GuardEffects["env"]): boolean {
  return env["VERCEL_ENV"] === "production" || env["VERCEL_ENV"] === "preview";
}

async function readWithTimeout(
  effects: GuardEffects,
): Promise<{ marker: DatabaseMarker } | { failure: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ failure: string }>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          failure: `the database did not answer within ${effects.timeoutMs / 1000}s`,
        }),
      effects.timeoutMs,
    );
  });

  try {
    return await Promise.race([
      effects.readMarker().then((marker) => ({ marker })),
      timeout,
    ]);
  } catch (error) {
    return {
      failure: `reading the marker failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runDatabaseEnvironmentGuard(
  effects: GuardEffects,
): Promise<Verdict> {
  const { serverStartVerdict, readAllowProductionDb, describeMarker } =
    await import("@/lib/database-environment-guard");

  const read = await readWithTimeout(effects);

  let verdict: Verdict;
  if ("failure" in read) {
    // A deployed process must not die on a slow cold start; a local one is
    // useless without the database anyway, and refusing keeps the guard from
    // being bypassed by simply making the marker unreadable.
    verdict = isDeployed(effects.env)
      ? {
          outcome: "warn",
          reason: `Could not verify the database environment: ${read.failure}.`,
        }
      : {
          outcome: "refuse",
          reason: `Could not verify the database environment: ${read.failure}. Check DATABASE_URL in .env.local. If this is the named, time-boxed incident shell, set KCLUB_ALLOW_PRODUCTION_DB=1.`,
        };
    if (!isDeployed(effects.env) && readAllowProductionDb(effects.env)) {
      verdict = {
        outcome: "warn",
        reason: `KCLUB_ALLOW_PRODUCTION_DB=1 is set and the marker could not be read (${read.failure}).`,
      };
    }
  } else {
    verdict = serverStartVerdict({
      marker: read.marker,
      nodeEnv: effects.env["NODE_ENV"],
      vercelEnv: effects.env["VERCEL_ENV"],
      allowProductionDb: readAllowProductionDb(effects.env),
    });
    if (verdict.outcome === "allow") {
      effects.log(`database environment: ${describeMarker(read.marker)}`);
    }
  }

  if (verdict.outcome === "warn") {
    effects.warn(`[database-environment] ${verdict.reason}`);
  } else if (verdict.outcome === "refuse") {
    effects.error(
      [
        "",
        "════════════════════════════════════════════════════════════════",
        "  REFUSING TO START (ADR 0026)",
        `  ${verdict.reason}`,
        "════════════════════════════════════════════════════════════════",
        "",
      ].join("\n"),
    );
    effects.exit(1);
  }

  return verdict;
}

/**
 * Production wiring. Imports the database lazily so this file can be loaded
 * by the instrumentation hook without dragging `@/env` into the edge bundle.
 */
export async function guardDatabaseEnvironment(): Promise<void> {
  const [{ db }, { readDatabaseMarker }, { logger }] = await Promise.all([
    import("@/data/db"),
    import("@/data/database-environment"),
    import("@/lib/logger"),
  ]);

  await runDatabaseEnvironmentGuard({
    readMarker: () => readDatabaseMarker(db),
    env: process.env,
    exit: (code) => process.exit(code),
    log: (message) => logger.info(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}
