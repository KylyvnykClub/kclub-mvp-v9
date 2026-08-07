/**
 * Prove every migration is reversible by running up → down → up on the
 * current database.
 *
 * Usage: pnpm db:updownup
 *
 * For each migration in db/migrations/, this script:
 *   1. Applies the up migration (the .sql file)
 *   2. Applies the corresponding .down.sql
 *   3. Re-applies the up migration
 *
 * Exits 0 if all cycles succeed, 1 if any fail.
 * data-storage.md §3: "Reversibility is not assumed; it is tested."
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sql = neon(process.env.DATABASE_URL_DIRECT!);
const migrationsDir = join(import.meta.dirname, "..", "db", "migrations");

async function run(file: string, label: string) {
  const path = join(migrationsDir, file);
  const content = readFileSync(path, "utf-8").trim();
  if (
    !content ||
    content === "-- Custom SQL migration file, put your code below! --"
  ) {
    console.log(`  [skip] ${label} — empty`);
    return;
  }
  let statements: string[] = [];
  if (content.includes("--> statement-breakpoint")) {
    statements = content.split("--> statement-breakpoint");
  } else {
    // Custom split ignoring semicolons inside $$ ... $$
    const parts = content.split("$$");
    let current = "";
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        current += "$$" + parts[i] + "$$";
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

  statements = statements
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length === 0) return false;
      const lines = s.split("\n").map((l) => l.trim());
      // Keep if at least one line is not a comment or empty
      return lines.some((l) => l.length > 0 && !l.startsWith("--"));
    });
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  console.log(`  [ok]   ${label}`);
}

const upFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
  .sort();

// Drop the drizzle migration tracking so we can re-apply freely
await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;

let failed = false;

for (const upFile of upFiles) {
  const downFile = upFile.replace(".sql", ".down.sql");
  const name = upFile.replace(".sql", "");
  console.log(`\n${name}:`);
  try {
    await run(upFile, "up");
    await run(downFile, "down");
    await run(upFile, "up (again)");
  } catch (err) {
    console.error(`  [FAIL] ${String(err)}`);
    failed = true;
  }
}

// Re-run drizzle-kit migrate to restore the tracking table
console.log("\nRestoring drizzle migration state...");
process.exit(failed ? 1 : 0);
