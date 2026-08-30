import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Which environment this database *is* — as opposed to `VERCEL_ENV`, which
 * says where the application runs. The two differ exactly when someone points
 * a laptop at production, which is the mistake this table exists to make
 * impossible (ADR 0026).
 *
 * One row, no default. A fresh database is unmarked; a branch copied from
 * production inherits the `production` row and is refused by every dev tool
 * until `pnpm db:reset:dev` rebuilds it from the migrations.
 */
export const DATABASE_ENVIRONMENTS = [
  "production",
  "dev",
  "preview",
  "test",
] as const;

export type DatabaseEnvironment = (typeof DATABASE_ENVIRONMENTS)[number];

export const databaseEnvironment = pgTable(
  "database_environment",
  {
    /** Always true — the primary key that makes a second row impossible. */
    singleton: boolean("singleton").primaryKey().default(true),
    name: text("name").notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Who marked it, as `user@host` — operational context, not personal data. */
    markedBy: text("marked_by"),
  },
  (table) => [
    check("database_environment_singleton", sql`${table.singleton}`),
    check(
      "database_environment_name",
      sql`${table.name} in ('production', 'dev', 'preview', 'test')`,
    ),
  ],
);
