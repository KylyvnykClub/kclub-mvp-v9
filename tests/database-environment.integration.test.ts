import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import {
  markDatabaseEnvironment,
  readDatabaseMarker,
} from "@/data/database-environment.js";
import { databaseEnvironment } from "@/data/schema/index.js";
import { getTestClient, getTestDb } from "./setup/integration-setup.js";

function testDb(): DbClient {
  return getTestDb() as unknown as DbClient;
}

/**
 * Runs one statement under a savepoint on the test connection and returns the
 * name of the constraint Postgres reported, so the outer test transaction
 * survives the expected failure. drizzle wraps the driver error, so the
 * constraint is read from pg's own error rather than from a message match.
 */
async function violatedConstraint(statement: string): Promise<string | null> {
  const client = getTestClient();
  await client.query("SAVEPOINT expected_failure");
  try {
    await client.query(statement);
    return null;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT expected_failure");
    return (error as { constraint?: string }).constraint ?? "unknown";
  } finally {
    await client.query("RELEASE SAVEPOINT expected_failure");
  }
}

describe("database environment marker (ADR 0026)", () => {
  it("the migration creates database_environment with no row, so a fresh database reads unmarked", async () => {
    expect(await readDatabaseMarker(testDb())).toEqual({ kind: "unmarked" });
  });

  it("markDatabaseEnvironment writes one row and readDatabaseMarker round-trips it", async () => {
    const db = testDb();
    await markDatabaseEnvironment(db, "dev", "tester@ci");

    const marker = await readDatabaseMarker(db);
    expect(marker).toMatchObject({
      kind: "marked",
      name: "dev",
      markedBy: "tester@ci",
    });
    expect(marker.kind === "marked" && marker.markedAt).toBeInstanceOf(Date);
  });

  it("a second mark replaces the row (singleton constraint)", async () => {
    const db = testDb();
    await markDatabaseEnvironment(db, "preview", "first@ci");
    await markDatabaseEnvironment(db, "test", "second@ci");

    const rows = await db.select().from(databaseEnvironment);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "test", markedBy: "second@ci" });
  });

  it("rejects a name outside the four environments (check constraint)", async () => {
    expect(
      await violatedConstraint(
        "insert into database_environment (name) values ('staging')",
      ),
    ).toBe("database_environment_name");

    // The savepoint rolled back, so the outer test transaction still works.
    expect(await readDatabaseMarker(testDb())).toEqual({ kind: "unmarked" });
  });

  it("rejects a second row even with a different singleton value (check constraint)", async () => {
    const db = testDb();
    await markDatabaseEnvironment(db, "dev", "tester@ci");
    expect(
      await violatedConstraint(
        "insert into database_environment (singleton, name) values (false, 'dev')",
      ),
    ).toBe("database_environment_singleton");
  });

  it("reads no_table without an error after the table is dropped inside the test transaction", async () => {
    const db = testDb();
    await db.execute(sql`drop table database_environment`);

    expect(await readDatabaseMarker(db)).toEqual({ kind: "no_table" });
  });
});
