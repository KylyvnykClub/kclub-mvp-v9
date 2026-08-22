import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

/**
 * Applying `db/migrations` to a throwaway database.
 *
 * Extracted from global-setup.ts so the e2e harness raises its schema exactly
 * the way the integration suite does. Two copies of a migration runner is one
 * copy too many - see the backlog item on the journal-versus-directory
 * disagreement, which is the same class of problem one level up.
 */

export function splitSqlStatements(sql: string): string[] {
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

/**
 * Runs every up-migration in `migrationsDir`, in filename order.
 *
 * Note this walks the directory rather than `meta/_journal.json`, which is what
 * drizzle-kit reads. The two are kept in step by hand today, and a migration
 * present here but absent from the journal passes this runner while being
 * skipped against a real database - tracked as
 * `migration-runners-disagree-journal-vs-directory`.
 */
export async function runMigrations(
  connectionString: string,
  migrationsDir: string,
): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const files = await readdir(migrationsDir);
    const upFiles = files
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();

    for (const file of upFiles) {
      const sql = await readFile(join(migrationsDir, file), "utf-8");

      for (const statement of splitSqlStatements(sql)) {
        await client.query(statement);
      }
    }
  } finally {
    await client.end();
  }
}
