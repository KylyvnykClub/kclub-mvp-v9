/**
 * Decides whether the private-beta seed dataset may be written to the database
 * that tools/seed.ts is pointed at.
 *
 * The original guard keyed off the `--production` CLI flag, which `pnpm
 * db:seed:beta` never passes - so it approved whatever database DATABASE_URL
 * resolved to, and once seeded production from a developer's `.env.local`
 * (backlog: beta-seed-guard-checks-a-flag-not-the-database). This decides from
 * the environment and the database's own contents instead, and lives in its own
 * module so the decision is unit-testable without a database or running the
 * seed script's top-level main().
 */

import type { DatabaseMarker } from "../src/data/database-environment";

export interface BetaSeedTarget {
  /** Whether the seed run was invoked with the --production flag. */
  isProductionFlag: boolean;
  /** process.env.NODE_ENV at invocation. */
  nodeEnv: string | undefined;
  /** process.env.VERCEL_ENV at invocation. */
  vercelEnv: string | undefined;
  /**
   * Members already in the target database whose phone is outside the beta set,
   * excluding the bootstrap staff owner (which this same run creates first). A
   * non-zero count means the database holds real, shared, or production data.
   */
  realMemberCount: number;
  /** What the database says it is (ADR 0026). */
  marker: DatabaseMarker;
}

/**
 * The reason to refuse seeding this target, or null when it is safe. Fails
 * closed: a production marker, any production signal, or any pre-existing
 * non-beta member refuses.
 */
export function betaSeedRefusal(target: BetaSeedTarget): string | null {
  if (target.marker.kind === "marked" && target.marker.name === "production") {
    return "The database is marked production (ADR 0026); beta seed never runs there, whatever it holds.";
  }

  if (
    target.isProductionFlag ||
    target.nodeEnv === "production" ||
    target.vercelEnv === "production"
  ) {
    return "This is a production environment; beta seed is for staging/preview only.";
  }

  if (target.realMemberCount > 0) {
    return (
      `The target database already holds ${target.realMemberCount} member(s) outside the ` +
      "beta set, so it looks like a real, shared, or production database - not a clean " +
      "staging one. This guard reads the database's contents, not a CLI flag."
    );
  }

  return null;
}

export function describeDatabaseTarget(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\/+/, "") || "(default)";

  return `${parsed.protocol}//${parsed.hostname}/${database}`;
}

export function betaPurgeRefusal(target: {
  execute: boolean;
  confirmedProductionPurge: boolean;
}): string | null {
  if (!target.execute) return null;

  if (!target.confirmedProductionPurge) {
    return (
      "Refusing to execute the beta purge without --confirm-production-purge. " +
      "Run a dry run first, confirm the target database and counts, then pass both flags."
    );
  }

  return null;
}
