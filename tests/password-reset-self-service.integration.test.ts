import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  consumeVerificationToken,
  createVerificationToken,
  deleteSessionsByMemberId,
  markEmailVerified,
  setMemberEmail,
  setMemberPasswordHash,
} from "@/data/identity.js";
import { members, sessions } from "@/data/schema/index.js";
import { hashVerificationToken } from "@/lib/verification-token.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

let seq = 0;

async function seedMember(db: DbClient, email: string | null) {
  seq += 1;
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15557${String(1000 + seq).slice(-4)}`,
      passwordHash: "old-hash",
      displayName: `Resetter ${seq}`,
      country: "US",
      language: "en",
    })
    .returning();

  if (email) {
    await setMemberEmail(db, member!.id, email);
  }

  for (const suffix of ["a", "b"]) {
    await db.insert(sessions).values({
      memberId: member!.id,
      token: `reset-${seq}-${suffix}`,
      tokenHash: `reset-${seq}-${suffix}`,
      userAgent: "test",
      ipAddress: "127.0.0.1",
    });
  }

  return member!;
}

async function issueReset(
  db: DbClient,
  memberId: string,
  email: string,
  expiresAt: Date,
) {
  seq += 1;
  const token = `reset-token-${seq}`;

  await createVerificationToken(db, {
    memberId,
    purpose: "password_reset",
    email,
    tokenHash: hashVerificationToken(token),
    expiresAt,
  });

  return token;
}

const inHalfAnHour = () => new Date(Date.now() + 30 * 60 * 1000);

/**
 * Self-service password reset, proved by an emailed link (FR-006, ADR 0028).
 *
 * FR-006 has two halves and the second is the one that gets forgotten: the
 * password changes, **and** every other session ends. A reset that leaves the
 * old sessions alive is worse than useless when the reason for the reset is
 * that somebody else is in the account.
 *
 * The staff-performed reset (ADR 0018) keeps its own suite; it remains the
 * path for members who hold no address.
 */
describe("self-service password reset (FR-006, ADR 0028)", () => {
  it("FR-006: a reset link replaces the hash and ends every session", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "reset@example.com");
    await markEmailVerified(db, member.id, "reset@example.com", new Date());
    const token = await issueReset(
      db,
      member.id,
      "reset@example.com",
      inHalfAnHour(),
    );

    const consumed = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "password_reset",
      new Date(),
    );
    expect(consumed?.memberId).toBe(member.id);

    await setMemberPasswordHash(db, consumed!.memberId, "new-hash");
    await deleteSessionsByMemberId(db, consumed!.memberId);

    const [after] = await db
      .select({ passwordHash: members.passwordHash })
      .from(members)
      .where(eq(members.id, member.id));
    expect(after!.passwordHash).toBe("new-hash");

    expect(
      await db.select().from(sessions).where(eq(sessions.memberId, member.id)),
    ).toHaveLength(0);
  });

  it("FR-006: the link works once", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "once-reset@example.com");
    const token = await issueReset(
      db,
      member.id,
      "once-reset@example.com",
      inHalfAnHour(),
    );

    const first = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "password_reset",
      new Date(),
    );
    const second = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "password_reset",
      new Date(),
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("FR-006: an expired link is refused", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "stale-reset@example.com");
    const token = await issueReset(
      db,
      member.id,
      "stale-reset@example.com",
      new Date(Date.now() - 1000),
    );

    expect(
      await consumeVerificationToken(
        db,
        hashVerificationToken(token),
        "password_reset",
        new Date(),
      ),
    ).toBeNull();
  });

  it("ADR 0028: a reset token cannot be spent as an address confirmation", async () => {
    // The two purposes share a table. If either could be redeemed as the
    // other, a link sent to confirm an address would set a password.
    const db = testDbClient();
    const member = await seedMember(db, "purpose-reset@example.com");
    const token = await issueReset(
      db,
      member.id,
      "purpose-reset@example.com",
      inHalfAnHour(),
    );

    expect(
      await consumeVerificationToken(
        db,
        hashVerificationToken(token),
        "email_verify",
        new Date(),
      ),
    ).toBeNull();
  });

  it("ADR 0028: asking again invalidates the link already sent", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "reissue@example.com");

    const first = await issueReset(
      db,
      member.id,
      "reissue@example.com",
      inHalfAnHour(),
    );
    const second = await issueReset(
      db,
      member.id,
      "reissue@example.com",
      inHalfAnHour(),
    );

    expect(
      await consumeVerificationToken(
        db,
        hashVerificationToken(first),
        "password_reset",
        new Date(),
      ),
    ).toBeNull();
    expect(
      await consumeVerificationToken(
        db,
        hashVerificationToken(second),
        "password_reset",
        new Date(),
      ),
    ).not.toBeNull();
  });

  it("ADR 0028: the raw token never reaches the database", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "opaque@example.com");
    const token = await issueReset(
      db,
      member.id,
      "opaque@example.com",
      inHalfAnHour(),
    );

    const rows = await db.execute(
      `SELECT token_hash FROM verification_tokens WHERE member_id = '${member.id}'`,
    );
    const hashes = (rows.rows as { token_hash: string }[]).map(
      (row) => row.token_hash,
    );

    expect(hashes).toContain(hashVerificationToken(token));
    expect(hashes).not.toContain(token);
  });
});
