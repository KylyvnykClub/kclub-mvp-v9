/**
 * Data migrations: the changes a SQL migration cannot make, run by the
 * production build right after `drizzle-kit migrate` and before the new
 * version takes traffic (`tools/vercel-build.ts`, data-storage.md §3).
 *
 * Every step must be idempotent - it runs on every production build, and on
 * all but the first it finds nothing to do. A failed step fails the build, and
 * a failed build is never promoted.
 *
 * Steps:
 *   - FR-020 card serials into the `UA-10001` form. Needs libphonenumber-js to
 *     read the country from the phone, which SQL cannot reach. A card the old
 *     version issued while this build ran is picked up by the next build.
 *
 * Production only, like the schema migrations: anywhere else this is
 * `pnpm db:renumber-cards`, behind the database-environment guard.
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import type { DbClient } from "../src/data/db";
import * as schema from "../src/data/schema";
import { backfillCardSerials } from "./card-serial-backfill";

async function main(): Promise<void> {
  if (process.env["VERCEL_ENV"] !== "production") {
    console.error(
      "data-migrations runs only inside the production build (VERCEL_ENV=production).",
    );
    process.exit(1);
  }

  // The same connection drizzle-kit migrated through a moment ago.
  const databaseUrl = process.env["DATABASE_URL_DIRECT"];
  if (!databaseUrl) {
    console.error("DATABASE_URL_DIRECT is not set for the production build.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle({ client: pool, schema }) as unknown as DbClient;
    const log = (line: string) => console.log(`[data] ${line}`);

    log("FR-020 card serials");
    await backfillCardSerials(db, { apply: true, log });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
