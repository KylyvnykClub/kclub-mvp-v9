import type { DatabaseMarker } from "@/data/database-environment";

/**
 * Decides whether a process may run against the database it is pointed at,
 * from what the database says about itself (ADR 0026).
 *
 * Pure on purpose, in the shape of `tools/beta-seed-guard.ts`: every rule here
 * is unit-tested without a database, and both `src/instrumentation.ts` and the
 * tools under `tools/` call the same function rather than keeping private
 * copies of the policy. Nothing in this file reads `process.env`; the caller
 * passes what it read.
 *
 * The escape hatch, `KCLUB_ALLOW_PRODUCTION_DB=1`, exists for the documented
 * time-boxed incident shell (data-storage.md §9) and is read raw like
 * `KCLUB_SKIP_DB_PRERENDER` — it is not part of the env schema because it must
 * never be a normal setting. `pnpm env:check:production` rejects it outright.
 */

export interface GuardInput {
  marker: DatabaseMarker;
  /** process.env.NODE_ENV at invocation. */
  nodeEnv: string | undefined;
  /** process.env.VERCEL_ENV at invocation. */
  vercelEnv: string | undefined;
  /** Whether KCLUB_ALLOW_PRODUCTION_DB is exactly "1". */
  allowProductionDb: boolean;
}

export type Verdict =
  | { outcome: "allow" }
  | { outcome: "warn"; reason: string }
  | { outcome: "refuse"; reason: string };

const ESCAPE_HATCH_HINT =
  "If this is the named, time-boxed incident shell (data-storage.md §9), set KCLUB_ALLOW_PRODUCTION_DB=1 for this one process.";

export function readAllowProductionDb(
  env: Record<string, string | undefined>,
): boolean {
  return env["KCLUB_ALLOW_PRODUCTION_DB"] === "1";
}

export function describeMarker(marker: DatabaseMarker): string {
  switch (marker.kind) {
    case "marked":
      return `${marker.name} (marked ${marker.markedAt.toISOString()}${
        marker.markedBy ? ` by ${marker.markedBy}` : ""
      })`;
    case "unmarked":
      return "unmarked (database_environment exists but holds no row)";
    case "no_table":
      return "unmarked (database_environment table not present — marker migration not applied)";
  }
}

function isProductionMarker(marker: DatabaseMarker): boolean {
  return marker.kind === "marked" && marker.name === "production";
}

function isUnmarked(marker: DatabaseMarker): boolean {
  return marker.kind !== "marked";
}

/**
 * Applied once per server start from `src/instrumentation.ts`.
 *
 * A deployed process never gets `refuse`: a wrong marker in production is a
 * problem to alert on, not a reason to take the site down at a cold start. A
 * local process gets `refuse` for a production marker, which is the whole
 * point — `next dev` against production cannot happen by accident.
 */
export function serverStartVerdict(input: GuardInput): Verdict {
  const { marker, vercelEnv, allowProductionDb } = input;

  if (vercelEnv === "production") {
    if (isProductionMarker(marker)) return { outcome: "allow" };
    return {
      outcome: "warn",
      reason: `This production deployment is not on the production-marked database: ${describeMarker(marker)}.`,
    };
  }

  if (vercelEnv === "preview") {
    if (isProductionMarker(marker)) {
      return {
        outcome: "warn",
        reason:
          "This preview deployment runs on the production-marked database (backlog: preview-deployments-use-production-database).",
      };
    }
    return { outcome: "allow" };
  }

  if (allowProductionDb) {
    return {
      outcome: "warn",
      reason: `KCLUB_ALLOW_PRODUCTION_DB=1 is set — running against ${describeMarker(marker)} without the production guard.`,
    };
  }

  if (isProductionMarker(marker)) {
    return {
      outcome: "refuse",
      reason: `Refusing to start against the production-marked database (${describeMarker(marker)}). Point DATABASE_URL and DATABASE_URL_DIRECT in .env.local at the dev branch — see docs/operations.md §6. ${ESCAPE_HATCH_HINT}`,
    };
  }

  if (isUnmarked(marker)) {
    return {
      outcome: "warn",
      reason: `Database is ${describeMarker(marker)}. Run pnpm db:reset:dev for a dev branch, or pnpm db:mark-environment <name> for anything else.`,
    };
  }

  return { outcome: "allow" };
}

export interface DevToolInput extends GuardInput {
  /** Name of the tool, for the refusal message. */
  tool: string;
  /** Whether the tool was invoked with --production. */
  productionFlag: boolean;
}

/**
 * Applied by every tool under `tools/` that opens DATABASE_URL.
 *
 * `--production` together with the escape hatch is the one legitimate way to
 * run a tool against production — the one-time staff-owner bootstrap — and it
 * still produces a warning so the transcript shows it happened.
 */
export function devToolVerdict(input: DevToolInput): Verdict {
  const {
    marker,
    nodeEnv,
    vercelEnv,
    allowProductionDb,
    productionFlag,
    tool,
  } = input;

  if (isProductionMarker(marker)) {
    if (productionFlag && allowProductionDb) {
      return {
        outcome: "warn",
        reason: `${tool} is running against the production-marked database with --production and KCLUB_ALLOW_PRODUCTION_DB=1.`,
      };
    }
    return {
      outcome: "refuse",
      reason: `${tool} refuses the production-marked database (${describeMarker(marker)}). Dev tools run against the dev branch — see docs/operations.md §6. To run this tool on production deliberately, pass --production and set KCLUB_ALLOW_PRODUCTION_DB=1.`,
    };
  }

  if (nodeEnv === "production" || vercelEnv === "production") {
    return {
      outcome: "refuse",
      reason: `${tool} refuses to run in a production environment (NODE_ENV/VERCEL_ENV) against a database that is not marked production: ${describeMarker(marker)}.`,
    };
  }

  if (isUnmarked(marker)) {
    return {
      outcome: "warn",
      reason: `${tool} is running against an unmarked database: ${describeMarker(marker)}.`,
    };
  }

  return { outcome: "allow" };
}

export interface ResetInput {
  marker: DatabaseMarker;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  pooledUrl: string;
  directUrl: string;
}

/**
 * Applied by `tools/db-reset-dev.ts` before it drops the schema.
 *
 * There is no escape hatch here. Rebuilding a production-marked database is
 * never a maintenance action; the only path from `production` to `dev` is a
 * fresh branch. The URL check exists because the reset drops the schema over
 * the direct URL and the app then connects over the pooled one: if those name
 * different branches or roles, the reset would wipe one database and seed
 * another, or leave `public` owned by a role the app cannot use.
 */
export function resetVerdict(input: ResetInput): Verdict {
  const { marker, nodeEnv, vercelEnv, pooledUrl, directUrl } = input;

  if (nodeEnv === "production" || vercelEnv === "production") {
    return {
      outcome: "refuse",
      reason: "db:reset:dev never runs in a production environment.",
    };
  }

  if (isProductionMarker(marker)) {
    return {
      outcome: "refuse",
      reason: `db:reset:dev refuses the production-marked database (${describeMarker(marker)}). There is no override: create a fresh Neon branch and point .env.local at it.`,
    };
  }

  const pooled = parseNeonUrl(pooledUrl);
  const direct = parseNeonUrl(directUrl);
  if (!pooled || !direct) {
    return {
      outcome: "refuse",
      reason:
        "DATABASE_URL or DATABASE_URL_DIRECT in .env.local is not a parseable postgres:// URL.",
    };
  }
  if (pooled.endpoint !== direct.endpoint) {
    return {
      outcome: "refuse",
      reason: `DATABASE_URL (${pooled.endpoint}) and DATABASE_URL_DIRECT (${direct.endpoint}) name different Neon endpoints. Both must point at the same branch.`,
    };
  }
  if (pooled.role !== direct.role || pooled.database !== direct.database) {
    return {
      outcome: "refuse",
      reason:
        "DATABASE_URL and DATABASE_URL_DIRECT must use the same role and database: the reset recreates the public schema as the direct role, and the app connects as the pooled one.",
    };
  }

  return { outcome: "allow" };
}

/**
 * Neon's pooled host is the direct host with `-pooler` appended to the first
 * label; stripping it yields the endpoint id shared by both.
 */
function parseNeonUrl(
  raw: string,
): { endpoint: string; role: string; database: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!url.protocol.startsWith("postgres")) return null;

  const [first = "", ...rest] = url.hostname.split(".");
  const endpoint = [first.replace(/-pooler$/, ""), ...rest].join(".");
  return {
    endpoint,
    role: decodeURIComponent(url.username),
    database: url.pathname.replace(/^\/+/, ""),
  };
}
