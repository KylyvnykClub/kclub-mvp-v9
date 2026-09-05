import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  createSessionTx,
  deleteSessionsByMemberId,
  findActiveSessionByToken,
  registerMemberTx,
  setMemberEmail,
  upgradeSessionTx,
} from "@/data/identity.js";
import { setMemberStatus } from "@/data/members.js";
import {
  encryptTotpSecret,
  isEncryptedTotpSecret,
} from "@/modules/identity/totp-crypto.js";
import { generateTotpSecret } from "@/modules/identity/totp.js";
import { legalAcceptances, members, sessions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * Identity guarantees that survive ADR 0012: FR-001, FR-010, FR-080, FR-097.
 *
 * FR-002, FR-004 and FR-005 are not covered here and must not be - the SMS
 * code they describe is switched off, and a test that pretended otherwise
 * would be worse than the gap it hid.
 */

// Repetitive on purpose - see the note in totp-crypto.test.ts.
const ENCRYPTION_KEY = "totp-integration-key-".repeat(3);

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

// Registration issues a card, and the card token is derived from this secret.
beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-identity-secret";
});

let seq = 0;

function nextPhone() {
  seq += 1;
  return `+3805010${String(1000 + seq).slice(-4)}`;
}

async function register(
  db: DbClient,
  options: {
    phone?: string;
    consents?: { documentId: string; version: string }[];
  } = {},
) {
  const phone = options.phone ?? nextPhone();

  await registerMemberTx(db, {
    phone,
    email: null,
    passwordHash: "argon2id$hash",
    displayName: "Platform Member",
    country: "UA",
    language: "en",
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: options.consents ?? [],
    cardSerial: `KCLUB-P${String(seq).padStart(5, "0")}`,
    sessionToken: crypto.randomUUID(),
  });

  const member = await db.query.members.findFirst({
    where: eq(members.phone, phone),
  });

  return member!;
}

describe("FR-001: a member is identified by an E.164 phone number and a password", () => {
  it("stores the phone as given and hashes the password", async () => {
    const db = testDbClient();
    const phone = nextPhone();
    const member = await register(db, { phone });

    expect(member.phone).toBe(phone);
    expect(member.phone).toMatch(/^\+\d{6,}$/);
    expect(member.passwordHash).not.toBe("");
  });

  it("refuses a second member on the same number", async () => {
    const db = testDbClient();
    const phone = nextPhone();
    await register(db, { phone });

    await expect(register(db, { phone })).rejects.toThrow();
  });

  it("carries an optional email address alongside the phone (ADR 0032)", async () => {
    // This test used to assert the opposite: that no email column existed at
    // all, because FR-001 forbade an email identifier outright. ADR 0032
    // reversed that. What survives the reversal is the part that still
    // matters — the phone is not optional, and an address is.
    const db = testDbClient();
    const columns = await db.execute(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'members'`,
    );
    const rows = columns.rows as {
      column_name: string;
      is_nullable: string;
    }[];
    const by = (name: string) => rows.find((row) => row.column_name === name);

    expect(by("phone")?.is_nullable).toBe("NO");
    expect(by("email")?.is_nullable).toBe("YES");
    expect(by("email_verified_at")?.is_nullable).toBe("YES");
  });

  it("refuses a second member on the same address (ADR 0032)", async () => {
    const db = testDbClient();
    const first = await register(db, { phone: nextPhone() });
    const second = await register(db, { phone: nextPhone() });

    await setMemberEmail(db, first.id, "identifier@example.com");

    await expect(
      setMemberEmail(db, second.id, "identifier@example.com"),
    ).rejects.toThrow();
  });
});

describe("FR-010: blocking a member terminates every session they hold", () => {
  it("stops an existing session from authenticating", async () => {
    const db = testDbClient();
    const member = await register(db);
    const token = crypto.randomUUID();

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: token,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: false,
    });

    expect(await findActiveSessionByToken(db, token)).not.toBeNull();

    await setMemberStatus(db, member.id, "blocked");

    expect(await findActiveSessionByToken(db, token)).toBeNull();
  });

  it("removes the session rows, so unblocking does not resurrect them", async () => {
    const db = testDbClient();
    const member = await register(db);
    const token = crypto.randomUUID();

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: token,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: false,
    });

    await setMemberStatus(db, member.id, "blocked");
    await deleteSessionsByMemberId(db, member.id);
    await setMemberStatus(db, member.id, "active");

    expect(await findActiveSessionByToken(db, token)).toBeNull();
    expect(
      await db.select().from(sessions).where(eq(sessions.memberId, member.id)),
    ).toHaveLength(0);
  });

  it("leaves another member's sessions alone", async () => {
    const db = testDbClient();
    const blocked = await register(db);
    const bystander = await register(db);
    const theirToken = crypto.randomUUID();

    await createSessionTx(db, {
      memberId: bystander.id,
      sessionToken: theirToken,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: false,
    });

    await setMemberStatus(db, blocked.id, "blocked");
    await deleteSessionsByMemberId(db, blocked.id);

    expect(await findActiveSessionByToken(db, theirToken)).not.toBeNull();
  });
});

describe("FR-080: a staff sign-in is incomplete until the second factor is given", () => {
  it("marks a staff session partial when it is created", async () => {
    const db = testDbClient();
    const member = await register(db);
    const token = crypto.randomUUID();

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: token,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: true,
    });

    const session = await findActiveSessionByToken(db, token);
    expect(session?.isPartialSession).toBe(true);
  });

  it("clears the partial flag only once the code is verified", async () => {
    const db = testDbClient();
    const member = await register(db);
    const token = crypto.randomUUID();

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: token,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: true,
    });

    await upgradeSessionTx(db, token, member.id, "127.0.0.1", "test");

    const session = await findActiveSessionByToken(db, token);
    expect(session?.isPartialSession).toBe(false);
  });

  it("records the enrolled secret when the second factor is set up during sign-in", async () => {
    const db = testDbClient();
    const member = await register(db);
    const token = crypto.randomUUID();

    // What the service stores against the partial session: the seed already
    // encrypted and bound to this member. The plaintext never reaches this
    // layer, which is the point of the change.
    const encrypted = encryptTotpSecret(
      generateTotpSecret().secret,
      member.id,
      ENCRYPTION_KEY,
    );

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: token,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: true,
      pendingTotpSecret: encrypted,
    });

    await upgradeSessionTx(
      db,
      token,
      member.id,
      "127.0.0.1",
      "test",
      encrypted,
    );

    const updated = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(updated?.totpEnabled).toBe(true);
    expect(updated?.totpSecret).toBe(encrypted);
    expect(isEncryptedTotpSecret(updated?.totpSecret ?? null)).toBe(true);

    // The seed must not linger on a session that is now fully authenticated.
    const upgraded = await findActiveSessionByToken(db, token);
    expect(upgraded?.pendingTotpSecret).toBeNull();
  });

  it("clears an abandoned pending secret even when nothing is enrolled", async () => {
    const db = testDbClient();
    const member = await register(db);
    const token = crypto.randomUUID();

    const encrypted = encryptTotpSecret(
      generateTotpSecret().secret,
      member.id,
      ENCRYPTION_KEY,
    );

    await createSessionTx(db, {
      memberId: member.id,
      sessionToken: token,
      userAgent: "test",
      ipAddress: "127.0.0.1",
      isPartialSession: true,
      pendingTotpSecret: encrypted,
    });

    // Upgrading without enrolling - the member already had a factor, or the
    // enrolment was abandoned. Either way the pending seed is not left behind.
    await upgradeSessionTx(db, token, member.id, "127.0.0.1", "test");

    const upgraded = await findActiveSessionByToken(db, token);
    expect(upgraded?.pendingTotpSecret).toBeNull();

    const updated = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });
    expect(updated?.totpEnabled).toBe(false);
  });
});

describe("FR-097: each acknowledgement is recorded with its version and timestamp", () => {
  it("stores one row per document, each with the version accepted", async () => {
    const db = testDbClient();
    const member = await register(db, {
      consents: [
        { documentId: "terms-of-use", version: "1.0" },
        { documentId: "privacy-policy", version: "1.0" },
        { documentId: "arbitration", version: "1.0" },
        { documentId: "age-verification", version: "1.0" },
      ],
    });

    const accepted = await db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.memberId, member.id));

    expect(accepted).toHaveLength(4);
    for (const row of accepted) {
      expect(row.version).toBe("1.0");
      expect(row.acceptedAt).toBeInstanceOf(Date);
    }
  });

  it("keeps the arbitration waiver and the age attestation as separate records", async () => {
    const db = testDbClient();
    const member = await register(db, {
      consents: [
        { documentId: "arbitration", version: "1.0" },
        { documentId: "age-verification", version: "1.0" },
      ],
    });

    const ids = (
      await db
        .select()
        .from(legalAcceptances)
        .where(eq(legalAcceptances.memberId, member.id))
    )
      .map((row) => row.documentId)
      .sort();

    // Separate rows, so neither can be inferred from accepting the other.
    expect(ids).toEqual(["age-verification", "arbitration"]);
  });

  it("records nothing when nothing was acknowledged", async () => {
    const db = testDbClient();
    const member = await register(db, { consents: [] });

    expect(
      await db
        .select()
        .from(legalAcceptances)
        .where(eq(legalAcceptances.memberId, member.id)),
    ).toHaveLength(0);
  });
});
