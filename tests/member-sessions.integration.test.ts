import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  createSessionTx,
  deleteOtherSessionsForMember,
  deleteSessionByIdForMember,
  findActiveSessionByToken,
  listSessionsByMemberId,
  registerMemberTx,
} from "@/data/identity.js";
import { members, sessions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-007: a member lists their active sessions and revokes any or all of them.
 *
 * This is the control someone reaches for when they think their account is
 * being used from a device they do not have, so the cases that matter are the
 * ones where it must not overreach: another member's session, a guessed id,
 * and the session making the request.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-sessions-secret";
});

let seq = 0;

async function seedMember(db: DbClient) {
  seq += 1;
  const phone = `+3807030${String(1000 + seq).slice(-4)}`;

  await registerMemberTx(db, {
    phone,
    passwordHash: "argon2id$hash",
    displayName: "Session Owner",
    country: "UA",
    language: "en",
    userAgent: "seed",
    ipAddress: "127.0.0.1",
    consents: [],
    cardSerial: `KCLUB-S${String(seq).padStart(5, "0")}`,
    sessionToken: crypto.randomUUID(),
  });

  return (await db.query.members.findFirst({
    where: eq(members.phone, phone),
  }))!;
}

async function addSession(
  db: DbClient,
  memberId: string,
  overrides: { userAgent?: string; partial?: boolean } = {},
) {
  const token = crypto.randomUUID();

  await createSessionTx(db, {
    memberId,
    sessionToken: token,
    userAgent: overrides.userAgent ?? "Mozilla/5.0 (Windows NT 10.0) Chrome/1",
    ipAddress: "203.0.113.10",
    isPartialSession: overrides.partial ?? false,
  });

  const session = (await findActiveSessionByToken(db, token))!;
  return { id: session.id, token };
}

describe("FR-007: a member can see their own sessions", () => {
  it("lists every session the member holds", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    await addSession(db, member.id);

    const listed = await listSessionsByMemberId(db, member.id);

    // One from registration, one added here.
    expect(listed.length).toBeGreaterThanOrEqual(2);
  });

  it("never returns the session token, which is a credential", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    await addSession(db, member.id);

    const listed = await listSessionsByMemberId(db, member.id);

    for (const row of listed) {
      expect(row).not.toHaveProperty("token");
      expect(row).not.toHaveProperty("tokenHash");
    }
  });

  it("returns the device and address a member would recognise a session by", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    await addSession(db, member.id, { userAgent: "Firefox on Linux" });

    const listed = await listSessionsByMemberId(db, member.id);
    const added = listed.find((row) => row.userAgent === "Firefox on Linux");

    expect(added?.ipAddress).toBe("203.0.113.10");
    expect(added?.lastSeenAt).toBeInstanceOf(Date);
  });

  it("does not list another member's sessions", async () => {
    const db = testDbClient();
    const mine = await seedMember(db);
    const theirs = await seedMember(db);
    const theirSession = await addSession(db, theirs.id);

    const listed = await listSessionsByMemberId(db, mine.id);

    expect(listed.map((row) => row.id)).not.toContain(theirSession.id);
  });
});

describe("FR-007: a member can end one session", () => {
  it("ends the session and stops its token authenticating", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const other = await addSession(db, member.id);

    const ended = await deleteSessionByIdForMember(db, member.id, other.id);

    expect(ended).toBe(1);
    expect(await findActiveSessionByToken(db, other.token)).toBeNull();
  });

  it("refuses to end a session belonging to someone else", async () => {
    const db = testDbClient();
    const attacker = await seedMember(db);
    const victim = await seedMember(db);
    const victimSession = await addSession(db, victim.id);

    const ended = await deleteSessionByIdForMember(
      db,
      attacker.id,
      victimSession.id,
    );

    expect(ended).toBe(0);
    expect(
      await findActiveSessionByToken(db, victimSession.token),
    ).not.toBeNull();
  });

  it("reports nothing ended for an id that does not exist", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    expect(
      await deleteSessionByIdForMember(db, member.id, crypto.randomUUID()),
    ).toBe(0);
  });
});

describe("FR-007: a member can end every other session", () => {
  it("ends the others and keeps the one making the request", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const current = await addSession(db, member.id);
    await addSession(db, member.id);
    await addSession(db, member.id);

    const ended = await deleteOtherSessionsForMember(db, member.id, current.id);

    expect(ended).toBeGreaterThanOrEqual(2);
    expect(await findActiveSessionByToken(db, current.token)).not.toBeNull();

    const remaining = await db
      .select()
      .from(sessions)
      .where(eq(sessions.memberId, member.id));
    expect(remaining.map((row) => row.id)).toEqual([current.id]);
  });

  it("leaves another member's sessions untouched", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const bystander = await seedMember(db);
    const current = await addSession(db, member.id);
    const theirs = await addSession(db, bystander.id);

    await deleteOtherSessionsForMember(db, member.id, current.id);

    expect(await findActiveSessionByToken(db, theirs.token)).not.toBeNull();
  });

  it("ends nothing when the member has only the current session", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    await db.delete(sessions).where(eq(sessions.memberId, member.id));
    const current = await addSession(db, member.id);

    expect(await deleteOtherSessionsForMember(db, member.id, current.id)).toBe(
      0,
    );
  });
});
