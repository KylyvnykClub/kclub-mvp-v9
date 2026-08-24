import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { join } from "node:path";
import { runMigrations } from "./migrations";

const MIGRATIONS_DIR = join(__dirname, "../../db/migrations");

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

  await runMigrations(connectionString, MIGRATIONS_DIR);

  process.env["TEST_DATABASE_URL"] = connectionString;
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
