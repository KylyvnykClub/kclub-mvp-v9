import { sql } from "drizzle-orm";
import type { DbClient } from "./db";
import {
  DATABASE_ENVIRONMENTS,
  databaseEnvironment,
  type DatabaseEnvironment,
} from "./schema";

/**
 * The only SQL for `database_environment` (ADR 0026). Policy — who may run
 * against which marker — lives in `@/lib/database-environment-guard`; this
 * module just reads and writes the row.
 */

export type DatabaseMarker =
  | {
      kind: "marked";
      name: DatabaseEnvironment;
      markedAt: Date;
      markedBy: string | null;
    }
  /** The table exists but nobody has marked this database yet. */
  | { kind: "unmarked" }
  /** The marker migration has not been applied here. */
  | { kind: "no_table" };

/**
 * Reads the marker without ever throwing on a missing table: `to_regclass`
 * returns NULL instead of raising, so the read is safe inside a transaction —
 * a raised error would poison the integration suite's held-open transaction.
 */
export async function readDatabaseMarker(
  db: DbClient,
): Promise<DatabaseMarker> {
  const exists = await db.execute<{ oid: string | null }>(
    sql`select to_regclass('public.database_environment')::text as oid`,
  );
  if (!exists.rows[0]?.oid) {
    return { kind: "no_table" };
  }

  const row = await db.query.databaseEnvironment.findFirst();
  if (!row) {
    return { kind: "unmarked" };
  }

  return {
    kind: "marked",
    name: row.name as DatabaseEnvironment,
    markedAt: row.markedAt,
    markedBy: row.markedBy,
  };
}

/** Upserts the single row. The caller decides whether the transition is allowed. */
export async function markDatabaseEnvironment(
  db: DbClient,
  name: DatabaseEnvironment,
  markedBy: string,
): Promise<void> {
  await db
    .insert(databaseEnvironment)
    .values({ singleton: true, name, markedBy })
    .onConflictDoUpdate({
      target: databaseEnvironment.singleton,
      set: { name, markedBy, markedAt: sql`now()` },
    });
}

export function isDatabaseEnvironment(
  value: string,
): value is DatabaseEnvironment {
  return (DATABASE_ENVIRONMENTS as readonly string[]).includes(value);
}
