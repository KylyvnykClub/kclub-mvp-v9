import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  closePasswordResetRequest,
  createPasswordResetRequest,
  listOpenPasswordResetRequests,
} from "@/data/password-reset-requests.js";
import { registerMemberTx } from "@/data/identity.js";
import { members, passwordResetRequests } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-recovery-secret";
});

let seq = 0;

async function seedMember(db: DbClient) {
  seq += 1;
  const phone = `+3806700${String(1000 + seq).slice(-4)}`;

  await registerMemberTx(db, {
    phone,
    email: null,
    passwordHash: "hash",
    displayName: `Locked Out ${seq}`,
    country: "UA",
    language: "en",
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: [],
    cardSerial: `KCLUB-R${String(seq).padStart(5, "0")}`,
    sessionToken: crypto.randomUUID(),
  });

  const member = await db.query.members.findFirst({
    where: eq(members.phone, phone),
  });

  return member!;
}

/**
 * The member's half of account recovery (FR-006, ADR 0031).
 *
 * Recovery itself is performed by a staff owner and is covered by
 * `password-reset.integration.test.ts`. What is new here is the queue: a
 * member can ask, staff can see who is waiting, and neither of those changes a
 * password. The cases below are the ones where a mistake is quiet — a request
 * that grants something, a queue that can be flooded, a row two staff members
 * can both close.
 */
describe("password reset requests (FR-006, ADR 0031)", () => {
  it("FR-006: a request reaches the queue", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });

    const open = await listOpenPasswordResetRequests(db);
    const mine = open.find((row) => row.memberId === member.id);

    expect(mine?.phone).toBe(member.phone);
    expect(mine?.displayName).toBe(member.displayName);
  });

  it("ADR 0031: asking twice leaves one row, not two", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });
    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });

    const rows = await db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.memberId, member.id));

    expect(rows).toHaveLength(1);
  });

  it("ADR 0031: a request grants nothing - the password is untouched", async () => {
    // The whole safety of this queue is that it is a request for attention.
    // If a row could change a credential, an anonymous form would be a way to
    // take an account.
    const db = testDbClient();
    const member = await seedMember(db);

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });

    const [after] = await db
      .select({ passwordHash: members.passwordHash, status: members.status })
      .from(members)
      .where(eq(members.id, member.id));

    expect(after!.passwordHash).toBe(member.passwordHash);
    expect(after!.status).toBe("active");
  });

  it("FR-006: closing takes it off the queue and records who did it", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const staff = await seedMember(db);

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });
    const [request] = await db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.memberId, member.id));

    const closed = await closePasswordResetRequest(db, {
      requestId: request!.id,
      staffId: staff.id,
      outcome: "handled",
      now: new Date(),
    });

    expect(closed).toBe(true);

    const open = await listOpenPasswordResetRequests(db);
    expect(open.find((row) => row.memberId === member.id)).toBeUndefined();

    const [row] = await db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.id, request!.id));
    expect(row!.status).toBe("handled");
    expect(row!.handledBy).toBe(staff.id);
    expect(row!.handledAt).not.toBeNull();
  });

  it("ADR 0031: only the first of two staff members closing it succeeds", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const staff = await seedMember(db);

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });
    const [request] = await db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.memberId, member.id));

    const first = await closePasswordResetRequest(db, {
      requestId: request!.id,
      staffId: staff.id,
      outcome: "handled",
      now: new Date(),
    });
    const second = await closePasswordResetRequest(db, {
      requestId: request!.id,
      staffId: staff.id,
      outcome: "dismissed",
      now: new Date(),
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("ADR 0031: a member may ask again once the first request is closed", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const staff = await seedMember(db);

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });
    const [first] = await db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.memberId, member.id));
    await closePasswordResetRequest(db, {
      requestId: first!.id,
      staffId: staff.id,
      outcome: "handled",
      now: new Date(),
    });

    await createPasswordResetRequest(db, {
      memberId: member.id,
      phone: member.phone,
    });

    const open = await listOpenPasswordResetRequests(db);
    expect(open.find((row) => row.memberId === member.id)).toBeDefined();
  });
});
