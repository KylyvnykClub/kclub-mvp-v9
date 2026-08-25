import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import {
  deleteSessionsByMemberId,
  setMemberPasswordHash,
} from "@/data/identity.js";
import { members, sessions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMemberWithSessions(db: DbClient, phoneSuffix: string) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15558${phoneSuffix}`,
      passwordHash: "old-hash",
      displayName: `Reset ${phoneSuffix}`,
      country: "US",
      language: "en",
    })
    .returning();

  for (const suffix of ["a", "b"]) {
    await db.insert(sessions).values({
      memberId: member!.id,
      token: `token-${phoneSuffix}-${suffix}`,
      tokenHash: `token-${phoneSuffix}-${suffix}`,
      userAgent: "test",
      ipAddress: "127.0.0.1",
    });
  }

  return member!;
}

/**
 * Staff-performed account recovery (FR-006, ADR 0018).
 *
 * FR-006 has two halves, and the second is the one that is easy to leave out:
 * the password changes, *and* every other session ends. A reset that leaves the
 * old sessions alive is worse than useless when the reason for the reset is
 * that somebody else is in the account.
 */
describe("staff password reset (FR-006, ADR 0018)", () => {
  it("replaces the stored hash", async () => {
    const db = testDbClient();
    const member = await seedMemberWithSessions(db, "0001");

    const updated = await setMemberPasswordHash(db, member.id, "new-hash");

    expect(updated).toBe(true);
    const [after] = await db
      .select({ passwordHash: members.passwordHash })
      .from(members)
      .where(eq(members.id, member.id));
    expect(after!.passwordHash).toBe("new-hash");
  });

  it("revokes every session of the member whose password was reset", async () => {
    const db = testDbClient();
    const member = await seedMemberWithSessions(db, "0002");

    const before = await db
      .select()
      .from(sessions)
      .where(eq(sessions.memberId, member.id));
    expect(before).toHaveLength(2);

    await setMemberPasswordHash(db, member.id, "new-hash");
    await deleteSessionsByMemberId(db, member.id);

    const after = await db
      .select()
      .from(sessions)
      .where(eq(sessions.memberId, member.id));
    expect(after).toHaveLength(0);
  });

  it("leaves other members' sessions alone", async () => {
    const db = testDbClient();
    const target = await seedMemberWithSessions(db, "0003");
    const bystander = await seedMemberWithSessions(db, "0004");

    await deleteSessionsByMemberId(db, target.id);

    const untouched = await db
      .select()
      .from(sessions)
      .where(eq(sessions.memberId, bystander.id));
    expect(untouched).toHaveLength(2);
  });

  it("reports a reset of a member that does not exist rather than silently succeeding", async () => {
    const db = testDbClient();

    const updated = await setMemberPasswordHash(
      db,
      "00000000-0000-4000-8000-000000000000",
      "new-hash",
    );

    expect(updated).toBe(false);
  });
});
