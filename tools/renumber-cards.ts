/**
 * Give every card issued before FR-020's `UA-10001` format a serial in it.
 *
 * Usage:
 *   pnpm db:renumber-cards              # report only, writes nothing
 *   pnpm db:renumber-cards --apply      # perform the renumbering
 *
 * Production does not need this: the deployment runs the same backfill as a
 * data migration (`tools/data-migrations.ts`). This is for dev and preview
 * databases, and for looking before anything is written.
 *
 * Oldest card first, so the earliest members hold the lowest numbers. A card
 * already in the new form is skipped, so a second run does nothing. The QR
 * keeps working: its token is derived from the card id, not from the serial.
 */

import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import type { DbClient } from "../src/data/db";
import * as schema from "../src/data/schema";
import { assertDatabaseEnvironment } from "./assert-database-environment";
import { backfillCardSerials } from "./card-serial-backfill";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const productionFlag = args.includes("--production");

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    process.exit(1);
  }

  await assertDatabaseEnvironment({
    tool: "db:renumber-cards",
    productionFlag,
  });

  // A pool, not the HTTP driver: each renumbering is a transaction.
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle({ client: pool, schema }) as unknown as DbClient;
    const count = await backfillCardSerials(db, {
      apply,
      log: (line) => console.log(line),
    });
    if (count > 0 && !apply) {
      console.log("\nReport only. Re-run with --apply to write these changes.");
    } else {
      console.log(`\n✅ Renumbered ${apply ? count : 0} card(s).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
