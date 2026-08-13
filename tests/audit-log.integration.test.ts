import { describe, it, expect } from "vitest";
import { getTestDb, getTestClient } from "./setup/integration-setup.js";
import { appendAuditEntry, searchAuditLogs } from "@/data/audit-log.js";
import type { DbClient } from "@/data/db.js";
import type pg from "pg";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function expectPermissionDenied(
  client: pg.Client,
  statement: string,
): Promise<void> {
  await client.query("SET ROLE app_rw");
  await client.query("SAVEPOINT permission_check");
  try {
    await expect(client.query(statement)).rejects.toThrow(/permission denied/);
    await client.query("ROLLBACK TO SAVEPOINT permission_check");
  } finally {
    await client.query("RESET ROLE");
  }
}

describe("audit_log", () => {
  it("appends an entry and returns id + timestamp", async () => {
    const db = getTestDb();
    const result = await appendAuditEntry(db, {
      actorType: "staff",
      actorId: "s1",
      action: "block",
      subjectType: "member",
      subjectId: "m1",
      meta: { before: { status: "active" }, after: { status: "blocked" } },
      ip: "127.0.0.1",
      correlationId: "req-123",
    });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it("stores system actor without actorId", async () => {
    const db = getTestDb();
    const result = await appendAuditEntry(db, {
      actorType: "system",
      action: "grant_entitlement",
      subjectType: "subscription",
      subjectId: "sub-1",
      meta: { stripeEventId: "evt_123" },
    });

    expect(result.id).toBeDefined();

    const client = getTestClient();
    const row = await client.query(
      "SELECT actor_id FROM audit_log WHERE id = $1",
      [result.id],
    );
    expect((row.rows[0] as { actor_id: string | null }).actor_id).toBeNull();
  });

  it("searches by actor, target, and date range", async () => {
    const db = testDbClient();
    await appendAuditEntry(db, {
      actorType: "staff_owner",
      actorId: "owner-1",
      action: "disable_staff",
      subjectType: "staff_user",
      subjectId: "staff-1",
      meta: { before: { status: "active" }, after: { status: "blocked" } },
    });
    await appendAuditEntry(db, {
      actorType: "staff_admin",
      actorId: "admin-1",
      action: "block_member",
      subjectType: "member",
      subjectId: "member-1",
    });

    const ownerRows = await searchAuditLogs(db, { actor: "owner-1" });
    expect(ownerRows.map((row) => row.action)).toContain("disable_staff");
    expect(ownerRows.map((row) => row.action)).not.toContain("block_member");

    const targetRows = await searchAuditLogs(db, { target: "staff_user" });
    expect(targetRows.map((row) => row.subjectId)).toContain("staff-1");
    expect(targetRows.map((row) => row.subjectId)).not.toContain("member-1");

    const todayRows = await searchAuditLogs(db, {
      dateFrom: new Date(Date.now() - 60_000),
      dateTo: new Date(Date.now() + 60_000),
    });
    expect(todayRows.length).toBeGreaterThanOrEqual(2);

    const futureRows = await searchAuditLogs(db, {
      dateFrom: new Date("2999-01-01T00:00:00.000Z"),
    });
    expect(futureRows).toHaveLength(0);
  });

  describe("append-only constraint (security.md §7)", () => {
    it("app_rw role can INSERT into audit_log", async () => {
      const client = getTestClient();

      await client.query(
        `INSERT INTO audit_log (actor_type, action, subject_type, subject_id)
         VALUES ('staff', 'test_insert', 'member', 'm1')`,
      );

      await client.query("SET ROLE app_rw");
      try {
        await client.query(
          `INSERT INTO audit_log (actor_type, action, subject_type, subject_id)
           VALUES ('staff', 'test_as_app_rw', 'member', 'm2')`,
        );
        const res = await client.query(
          "SELECT count(*)::int AS n FROM audit_log WHERE action = 'test_as_app_rw'",
        );
        expect((res.rows[0] as { n: number }).n).toBe(1);
      } finally {
        await client.query("RESET ROLE");
      }
    });

    it("app_rw role CANNOT UPDATE audit_log", async () => {
      const client = getTestClient();

      await client.query(
        `INSERT INTO audit_log (actor_type, action, subject_type, subject_id)
         VALUES ('staff', 'original', 'member', 'm1')`,
      );

      await expectPermissionDenied(
        client,
        "UPDATE audit_log SET action = 'tampered' WHERE action = 'original'",
      );
    });

    it("app_rw role CANNOT DELETE from audit_log", async () => {
      const client = getTestClient();

      await client.query(
        `INSERT INTO audit_log (actor_type, action, subject_type, subject_id)
         VALUES ('staff', 'should_persist', 'member', 'm1')`,
      );

      await expectPermissionDenied(
        client,
        "DELETE FROM audit_log WHERE action = 'should_persist'",
      );
    });
  });
});
