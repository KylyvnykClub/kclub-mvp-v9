/**
 * Prove every migration is reversible by running up -> down -> up on a
 * disposable database.
 *
 * Usage:
 *   pnpm db:updownup
 *     Starts a PostgreSQL Testcontainers database and destroys it afterwards.
 *
 *   $env:DB_UPDOWNUP_DATABASE_URL="postgres://..."
 *   $env:DB_UPDOWNUP_CONFIRM="disposable"
 *   pnpm db:updownup
 *     Uses an explicitly supplied disposable database. Never points at
 *     .env.local by default.
 */

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dirname, "..", "db", "migrations");

function splitSqlStatements(sql: string): string[] {
  let statements: string[] = [];

  if (sql.includes("--> statement-breakpoint")) {
    statements = sql.split("--> statement-breakpoint");
  } else {
    const parts = sql.split("$$");
    let current = "";
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        current += `$$${parts[i]}$$`;
      } else {
        const sub = parts[i]!.split(";");
        for (let j = 0; j < sub.length - 1; j++) {
          current += sub[j];
          if (current.trim()) statements.push(current);
          current = "";
        }
        current += sub[sub.length - 1];
      }
    }
    if (current.trim()) statements.push(current);
  }

  return statements
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length === 0) return false;
      return s
        .split("\n")
        .some(
          (line) => line.trim().length > 0 && !line.trim().startsWith("--"),
        );
    });
}

async function connectDisposableDatabase(): Promise<{
  client: pg.Client;
  cleanup: () => Promise<void>;
}> {
  const explicitUrl = process.env["DB_UPDOWNUP_DATABASE_URL"];
  if (explicitUrl) {
    if (process.env["DB_UPDOWNUP_CONFIRM"] !== "disposable") {
      throw new Error(
        "Refusing to use DB_UPDOWNUP_DATABASE_URL without DB_UPDOWNUP_CONFIRM=disposable.",
      );
    }

    const client = new pg.Client({ connectionString: explicitUrl });
    await client.connect();
    return {
      client,
      cleanup: () => client.end(),
    };
  }

  const container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("kclub_migration_proof")
    .withUsername("test")
    .withPassword("test")
    .start();

  const client = new pg.Client({
    connectionString: container.getConnectionUri(),
  });
  await client.connect();
  return {
    client,
    cleanup: async () => {
      await client.end();
      await container?.stop();
    },
  };
}

async function run(client: pg.Client, file: string, label: string) {
  const path = join(migrationsDir, file);
  if (!existsSync(path)) {
    throw new Error(`Missing migration file: ${file}`);
  }

  const content = readFileSync(path, "utf-8").trim();
  if (
    !content ||
    content === "-- Custom SQL migration file, put your code below! --"
  ) {
    console.log(`  [skip] ${label} - empty`);
    return;
  }

  for (const stmt of splitSqlStatements(content)) {
    await client.query(stmt);
  }
  console.log(`  [ok]   ${label}`);
}

const upFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
  .sort();

const { client, cleanup } = await connectDisposableDatabase();

let failed = false;

try {
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");

  for (const upFile of upFiles) {
    const downFile = upFile.replace(".sql", ".down.sql");
    const name = upFile.replace(".sql", "");
    console.log(`\n${name}:`);
    try {
      await run(client, upFile, "up");
      await run(client, downFile, "down");
      await run(client, upFile, "up (again)");
    } catch (err) {
      console.error(
        `  [FAIL] ${err instanceof Error ? err.message : String(err)}`,
      );
      failed = true;
    }
  }
} finally {
  await cleanup();
}

process.exit(failed ? 1 : 0);
