import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  consumeVerificationToken,
  createVerificationToken,
  findLatestVerificationTokenIssuedAt,
  findMemberByEmail,
  findMemberById,
  markEmailVerified,
  setMemberEmail,
} from "@/data/identity.js";
import { members, verificationTokens } from "@/data/schema/index.js";
import { hashVerificationToken } from "@/lib/verification-token.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient, suffix: string) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15559${suffix}`,
      passwordHash: "hash",
      displayName: `Member ${suffix}`,
      country: "US",
      language: "en",
    })
    .returning();

  return member!;
}

let issued = 0;

async function issue(
  db: DbClient,
  memberId: string,
  email: string,
  expiresAt: Date,
) {
  // Every call gets its own token. Reusing one would make the reissue test
  // pass for the wrong reason: the same hash overwritten by itself.
  const token = `token-${memberId}-${email}-${(issued += 1)}`;
  await createVerificationToken(db, {
    memberId,
    purpose: "email_verify",
    email,
    tokenHash: hashVerificationToken(token),
    expiresAt,
  });
  return token;
}

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

/**
 * The email identifier and the link that proves it (FR-001, ADR 0032).
 *
 * Every case here is one where a mistake is silent: a link that still works
 * after being used, a link that verifies an address it was not issued for, a
 * second member quietly taking an address that already belongs to someone.
 * None of them show up as an error at the time.
 */
describe("email verification (FR-001, ADR 0032)", () => {
  it("FR-001: a claimed address is stored unverified", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0001");

    await setMemberEmail(db, member.id, "one@example.com");

    const stored = await findMemberByEmail(db, "one@example.com");
    expect(stored?.id).toBe(member.id);
    expect(stored?.emailVerifiedAt).toBeNull();
  });

  it("FR-001: two members cannot hold the same address", async () => {
    const db = testDbClient();
    const first = await seedMember(db, "0002");
    const second = await seedMember(db, "0003");

    await setMemberEmail(db, first.id, "shared@example.com");

    await expect(
      setMemberEmail(db, second.id, "shared@example.com"),
    ).rejects.toThrow();
  });

  it("FR-001: reclaiming an address drops the proof that came with the old one", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0004");

    await setMemberEmail(db, member.id, "before@example.com");
    await markEmailVerified(db, member.id, "before@example.com", new Date());
    await setMemberEmail(db, member.id, "after@example.com");

    const stored = await findMemberByEmail(db, "after@example.com");
    expect(stored?.emailVerifiedAt).toBeNull();
  });

  it("FR-001: a resend leaves the proof alone — only a change of address drops it", async () => {
    // The bug this pins down: `claimEmail` used to write the address on every
    // submit, and `setMemberEmail` clears `email_verified_at` by design. A
    // member pressing "send a new link" for the address they had already
    // proved was therefore un-verified on the spot, and if that message never
    // arrived they could no longer sign in by address or reset their own
    // password. A resend issues a token and touches nothing else.
    const db = testDbClient();
    const member = await seedMember(db, "0020");
    await setMemberEmail(db, member.id, "resend@example.com");
    await markEmailVerified(db, member.id, "resend@example.com", new Date());

    await issue(db, member.id, "resend@example.com", inAnHour());

    const stored = await findMemberByEmail(db, "resend@example.com");
    expect(stored?.emailVerifiedAt).not.toBeNull();
  });

  it("FR-006: a member is reachable by id after the address the token names is gone", async () => {
    // A reset token carries the address it was minted for. If the account
    // moves to another address inside the token's lifetime, looking that
    // address up finds nobody — which is how the mandatory "your password
    // changed" notice (security.md §1) came to be silently dropped. By id it
    // is always found.
    const db = testDbClient();
    const member = await seedMember(db, "0021");
    await setMemberEmail(db, member.id, "old@example.com");
    await setMemberEmail(db, member.id, "new@example.com");

    expect(await findMemberByEmail(db, "old@example.com")).toBeFalsy();

    const byId = await findMemberById(db, member.id);
    expect(byId?.id).toBe(member.id);
    expect(byId?.email).toBe("new@example.com");
  });

  it("ADR 0032: a link verifies once, and the second attempt finds nothing", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0005");
    await setMemberEmail(db, member.id, "once@example.com");
    const token = await issue(db, member.id, "once@example.com", inAnHour());

    const first = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "email_verify",
      new Date(),
    );
    const second = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "email_verify",
      new Date(),
    );

    expect(first?.memberId).toBe(member.id);
    expect(second).toBeNull();
  });

  it("ADR 0032: an expired link is refused", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0006");
    await setMemberEmail(db, member.id, "stale@example.com");
    const token = await issue(
      db,
      member.id,
      "stale@example.com",
      new Date(Date.now() - 1000),
    );

    const consumed = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "email_verify",
      new Date(),
    );

    expect(consumed).toBeNull();
  });

  it("ADR 0032: a token presented for the other purpose is refused", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0007");
    await setMemberEmail(db, member.id, "purpose@example.com");
    const token = await issue(db, member.id, "purpose@example.com", inAnHour());

    const consumed = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "password_reset",
      new Date(),
    );

    expect(consumed).toBeNull();
  });

  it("ADR 0032: issuing a new link invalidates the previous one", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0008");
    await setMemberEmail(db, member.id, "resend@example.com");

    const first = await issue(db, member.id, "resend@example.com", inAnHour());
    const second = await issue(db, member.id, "resend@example.com", inAnHour());

    const stale = await consumeVerificationToken(
      db,
      hashVerificationToken(first),
      "email_verify",
      new Date(),
    );
    const fresh = await consumeVerificationToken(
      db,
      hashVerificationToken(second),
      "email_verify",
      new Date(),
    );

    expect(stale).toBeNull();
    expect(fresh?.memberId).toBe(member.id);
  });

  it("ADR 0032: a link cannot verify an address the member has since replaced", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0009");

    await setMemberEmail(db, member.id, "typo@example.com");
    const token = await issue(db, member.id, "typo@example.com", inAnHour());
    await setMemberEmail(db, member.id, "correct@example.com");

    const consumed = await consumeVerificationToken(
      db,
      hashVerificationToken(token),
      "email_verify",
      new Date(),
    );
    // The token is spent, but it names the address it was issued for, and the
    // account no longer holds it - so nothing is marked verified.
    const verified = await markEmailVerified(
      db,
      consumed!.memberId,
      consumed!.email,
      new Date(),
    );

    expect(consumed?.email).toBe("typo@example.com");
    expect(verified).toBe(false);

    const stored = await findMemberByEmail(db, "correct@example.com");
    expect(stored?.emailVerifiedAt).toBeNull();
  });

  it("ADR 0032: the raw token is never stored", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0010");
    await setMemberEmail(db, member.id, "secret@example.com");
    const token = await issue(db, member.id, "secret@example.com", inAnHour());

    const rows = await db
      .select({ tokenHash: verificationTokens.tokenHash })
      .from(verificationTokens)
      .where(eq(verificationTokens.memberId, member.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(rows[0]!.tokenHash).toBe(hashVerificationToken(token));
  });

  it("ADR 0032: the resend throttle can see when the last link went out", async () => {
    const db = testDbClient();
    const member = await seedMember(db, "0011");
    await setMemberEmail(db, member.id, "throttle@example.com");

    expect(
      await findLatestVerificationTokenIssuedAt(db, member.id, "email_verify"),
    ).toBeNull();

    await issue(db, member.id, "throttle@example.com", inAnHour());

    expect(
      await findLatestVerificationTokenIssuedAt(db, member.id, "email_verify"),
    ).toBeInstanceOf(Date);
  });
});
