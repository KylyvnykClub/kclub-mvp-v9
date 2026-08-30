/**
 * Rebuild the dev branch from the migrations (ADR 0026).
 *
 * Usage:
 *   pnpm db:reset:dev                              — branch already marked dev
 *   pnpm db:reset:dev --confirm-endpoint ep-xxxx   — first reset of a branch
 *   pnpm db:reset:dev --no-beta                    — skip the 30 beta partners
 *
 * One command from an empty (or copied, or stale) Neon branch to a working
 * application: drop the `public` and `drizzle` schemas, apply `db/migrations`
 * from zero with the same migrator drizzle-kit delegates to — so a later
 * `pnpm db:migrate` stays incremental — mark the branch `dev`, then seed
 * categories, the staff owner, the Stripe test-mode prices and the beta
 * dataset.
 *
 * What it refuses, with no override: a `production` marker (the copied rows
 * of a branch created from production are wiped by this tool, but only after
 * the operator has looked at the host — see --confirm-endpoint), a production
 * environment, and pooled/direct URLs that name different branches or roles.
 * The decision is `resetVerdict` in src/lib/database-environment-guard.ts.
 *
 * Order of failure: the marker is written only after the migrations succeed,
 * so a half-migrated branch stays unmarked and the command is simply re-run.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { join } from "node:path";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import type { DbClient } from "../src/data/db";
import {
  markDatabaseEnvironment,
  readDatabaseMarker,
} from "../src/data/database-environment";
import * as schema from "../src/data/schema";
import {
  describeMarker,
  resetVerdict,
} from "../src/lib/database-environment-guard";
import { assertDatabaseEnvironment } from "./assert-database-environment";
import { describeDatabaseTarget } from "./beta-seed-guard";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const noBeta = args.includes("--no-beta");
const confirmIndex = args.indexOf("--confirm-endpoint");
const confirmedEndpoint =
  confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;

function step(text: string): void {
  console.log(`\n── ${text} ${"─".repeat(Math.max(0, 58 - text.length))}`);
}

function run(command: string, commandArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} ${commandArgs.join(" ")} exited with ${code}`,
            ),
          ),
    );
  });
}

async function countIfPresent(
  client: pg.Client,
  table: "members" | "companies",
): Promise<number> {
  const probe = await client.query<{ present: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [`public.${table}`],
  );
  if (!probe.rows[0]?.present) return 0;
  const count = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table}`,
  );
  return count.rows[0]?.count ?? 0;
}

async function main(): Promise<void> {
  const pooledUrl = process.env["DATABASE_URL"];
  const directUrl = process.env["DATABASE_URL_DIRECT"];
  if (!pooledUrl || !directUrl) {
    console.error(
      "DATABASE_URL and DATABASE_URL_DIRECT must both be set in .env.local.",
    );
    process.exit(1);
  }

  if (existsSync(".env")) {
    console.warn(
      "WARNING: a .env file exists beside .env.local. Next.js reads both, so a stale DATABASE_URL in it can win. Delete it.",
    );
  }

  // The dev-tool verdict first: refuses a production marker like every other
  // tool, and prints TARGET/MARKER for the pooled URL the app will use.
  await assertDatabaseEnvironment({ tool: "db:reset:dev" });

  const client = new pg.Client({ connectionString: directUrl });
  await client.connect();
  const pgDb = drizzle(client, { schema });
  const db = pgDb as unknown as DbClient;

  try {
    const marker = await readDatabaseMarker(db);
    const verdict = resetVerdict({
      marker,
      nodeEnv: process.env["NODE_ENV"],
      vercelEnv: process.env["VERCEL_ENV"],
      pooledUrl,
      directUrl,
      confirmedEndpoint,
    });
    if (verdict.outcome === "refuse") {
      console.error(`\nRefusing to reset. ${verdict.reason}\n`);
      process.exitCode = 1;
      return;
    }
    if (verdict.outcome === "warn") {
      console.warn(`\nWARNING: ${verdict.reason}\n`);
    }

    const members = await countIfPresent(client, "members");
    const companies = await countIfPresent(client, "companies");
    console.log(`DIRECT: ${describeDatabaseTarget(directUrl)}`);
    console.log(
      `Dropping everything here: ${members} members, ${companies} companies, marker ${describeMarker(marker)}`,
    );

    step("Dropping the public and drizzle schemas");
    await client.query("SET lock_timeout = '3s'");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    console.log("  done");

    step("Applying db/migrations from zero");
    await migrate(pgDb, {
      migrationsFolder: join(process.cwd(), "db", "migrations"),
    });
    console.log("  done");

    step("Marking the branch dev");
    const markedBy = `${userInfo().username}@${hostname()}`;
    await markDatabaseEnvironment(db, "dev", markedBy);
    console.log(`  marked dev by ${markedBy}`);
  } finally {
    await client.end();
  }

  step("Seeding reference data, staff owner, prices");
  await run("pnpm", ["db:seed:categories"]);
  await run("pnpm", ["db:seed"]);
  if (noBeta) {
    console.log("\n  --no-beta: skipping the 30 beta partners");
  } else {
    await run("pnpm", ["db:seed:beta"]);
  }

  console.log(`
Dev branch rebuilt.

  pnpm dev                 — first log line should read "database environment: dev"
  pnpm stripe:listen       — in a second terminal, as always
  sign in as ADMIN_BOOTSTRAP_OWNER_PHONE and enrol TOTP
`);
}

main().catch((error: unknown) => {
  console.error(
    "\ndb:reset:dev failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
