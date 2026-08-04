import { beforeEach, afterEach } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

let client: pg.Client | undefined;
let db: NodePgDatabase | undefined;

beforeEach(async () => {
  const connectionString = process.env["TEST_DATABASE_URL"];
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is not set. Did the globalSetup run?");
  }

  client = new pg.Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");

  db = drizzle(client);
});

afterEach(async () => {
  if (client) {
    await client.query("ROLLBACK");
    await client.end();
    client = undefined;
    db = undefined;
  }
});

export function getTestDb(): NodePgDatabase {
  if (!db) {
    throw new Error(
      "getTestDb() called outside of a test. Make sure integration-setup.ts is loaded.",
    );
  }
  return db;
}

export function getTestClient(): pg.Client {
  if (!client) {
    throw new Error("getTestClient() called outside of a test.");
  }
  return client;
}
