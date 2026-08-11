import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = join(__dirname, "../../db/migrations");

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

async function runMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const files = await readdir(MIGRATIONS_DIR);
    const upFiles = files
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();

    for (const file of upFiles) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
      const statements = splitSqlStatements(sql);

      for (const stmt of statements) {
        await client.query(stmt);
      }
    }
  } finally {
    await client.end();
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  try {
    container = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("kclub_test")
      .withUsername("test")
      .withPassword("test")
      .start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to start PostgreSQL container. Is Docker running?\n${msg}`,
    );
  }

  const connectionString = container.getConnectionUri();

  await runMigrations(connectionString);

  process.env["TEST_DATABASE_URL"] = connectionString;
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
