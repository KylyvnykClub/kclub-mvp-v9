import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb, getTestClient } from "./setup/integration-setup.js";
import { createFactoryContext } from "./factories/index.js";
import { deterministicClock, deterministicIdSource } from "@/domain/context.js";

describe("integration test harness", () => {
  it("connects to a real PostgreSQL via Testcontainers", async () => {
    const db = getTestDb();
    const result = await db.execute(sql`SELECT 1 AS n`);
    expect(result.rows[0]).toEqual({ n: 1 });
  });

  it("has pgcrypto extension from baseline migration", async () => {
    const db = getTestDb();
    const result = await db.execute(sql`SELECT gen_random_uuid()::text AS id`);
    const id = result.rows[0] as { id: string };
    expect(id.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("rolls back writes between tests (part 1: insert)", async () => {
    const client = getTestClient();
    await client.query(
      "CREATE TEMP TABLE _smoke (id serial PRIMARY KEY, val text)",
    );
    await client.query("INSERT INTO _smoke (val) VALUES ('should disappear')");
    const res = await client.query("SELECT val FROM _smoke");
    expect(res.rows).toHaveLength(1);
  });

  it("rolls back writes between tests (part 2: table gone)", async () => {
    const client = getTestClient();
    const res = await client.query("SELECT to_regclass('_smoke') AS t");
    expect(res.rows[0]).toEqual({ t: null });
  });

  it("deterministic clock advances predictably", () => {
    const epoch = new Date("2026-06-15T12:00:00Z");
    const clock = deterministicClock(epoch, 5000);

    expect(clock.now()).toEqual(epoch);
    expect(clock.now()).toEqual(new Date("2026-06-15T12:00:05Z"));
    expect(clock.now()).toEqual(new Date("2026-06-15T12:00:10Z"));
  });

  it("deterministic id source produces sequential UUIDs", () => {
    const ids = deterministicIdSource();
    expect(ids.uuid()).toBe("00000000-0000-0000-0000-000000000001");
    expect(ids.uuid()).toBe("00000000-0000-0000-0000-000000000002");
    expect(ids.uuid()).toBe("00000000-0000-0000-0000-000000000003");
  });

  it("factory context wires clock and ids together", () => {
    const db = getTestDb();
    const ctx = createFactoryContext(db);

    expect(ctx.db).toBe(db);
    expect(ctx.clock.now()).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(ctx.ids.uuid()).toBe("00000000-0000-0000-0000-000000000001");
  });
});
