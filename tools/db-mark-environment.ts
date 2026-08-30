/**
 * Read or set the database's environment marker (ADR 0026).
 *
 * Usage:
 *   pnpm db:mark-environment --show
 *   pnpm db:mark-environment production | dev | preview | test
 *
 * Marking `production` is the safe direction and needs no override — the
 * worst a wrong `production` mark can do is make a dev branch refuse dev
 * tools. The other direction is refused outright: a database that says
 * `production` becomes something else only by being rebuilt from the
 * migrations on a fresh branch (`pnpm db:reset:dev`), never by relabelling.
 */

import { config } from "dotenv";
import { hostname, userInfo } from "node:os";

import {
  isDatabaseEnvironment,
  markDatabaseEnvironment,
  readDatabaseMarker,
} from "../src/data/database-environment";
import { describeMarker } from "../src/lib/database-environment-guard";
import { describeDatabaseTarget } from "./beta-seed-guard";
import { openMarkerClient } from "./assert-database-environment";

config({ path: ".env.local", quiet: true });

const USAGE =
  "Usage: pnpm db:mark-environment --show | production | dev | preview | test";

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    process.exit(1);
  }

  const argument = process.argv[2];
  if (!argument) {
    console.error(USAGE);
    process.exit(1);
  }

  const db = openMarkerClient(databaseUrl);
  const current = await readDatabaseMarker(db);
  console.log(`TARGET: ${describeDatabaseTarget(databaseUrl)}`);
  console.log(`MARKER: ${describeMarker(current)}`);

  if (argument === "--show") {
    return;
  }

  if (!isDatabaseEnvironment(argument)) {
    console.error(`\nUnknown environment "${argument}". ${USAGE}`);
    process.exit(1);
  }

  if (current.kind === "no_table") {
    console.error(
      "\nThe database_environment table does not exist here. Apply the migrations first (pnpm db:migrate).",
    );
    process.exit(1);
  }

  if (
    current.kind === "marked" &&
    current.name === "production" &&
    argument !== "production"
  ) {
    console.error(
      `\nRefusing to relabel a production-marked database as "${argument}". ` +
        "The only path from production to anything else is a fresh Neon branch rebuilt with pnpm db:reset:dev.",
    );
    process.exit(1);
  }

  const markedBy = `${userInfo().username}@${hostname()}`;
  await markDatabaseEnvironment(db, argument, markedBy);
  console.log(`\nMarked as ${argument} by ${markedBy}.`);
}

main().catch((error: unknown) => {
  console.error(
    "\ndb:mark-environment failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
