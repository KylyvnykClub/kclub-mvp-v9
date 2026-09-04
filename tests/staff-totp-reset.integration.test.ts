import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import { createSessionTx, deleteSessionsByMemberId } from "@/data/identity.js";
import { clearStaffTotpEnrolment } from "@/data/staff.js";
import { members, sessions } from "@/data/schema/index.js";
import { encryptTotpSecret } from "@/modules/identity/totp-crypto.js";
import { generateTotpSecret } from "@/modules/identity/totp.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

// Repetitive on purpose - see the note in totp-crypto.test.ts.
const ENCRYPTION_KEY = "totp-reset-integration-key-".repeat(2);

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-totp-reset-secret";
});

let seq = 0;

async function seedStaff(db: DbClient, role: "staff_owner" | "member") {
  seq += 1;
  const [row] = await db
    .insert(members)
    .values({
      phone: `+15551${String(1000 + seq).slice(-4)}`,
      passwordHash: "hash",
      displayName: `Staff ${seq}`,
      country: "US",
      language: "en",
      role,
    })
    .returning();

  const member = row!;

  if (role === "staff_owner") {
    // generateTotpSecret returns the seed and its otpauth URI; only the seed
    // is stored, and only encrypted.
    const { secret } = generateTotpSecret();
    await db
      .update(members)
      .set({
        totpSecret: encryptTotpSecret(secret, member.id, ENCRYPTION_KEY),
        totpEnabled: true,
      })
      .where(eq(members.id, member.id));
  }

  await createSessionTx(db, {
    memberId: member.id,
    sessionToken: crypto.randomUUID(),
    userAgent: "test",
    ipAddress: "127.0.0.1",
  });

  return member;
}

/**
 * Discarding a staff authenticator (FR-080, ADR 0016).
 *
 * Written after a real incident: the owner's authenticator held a seed that
 * matched nothing on the server, every code was refused, and the only cure was
 * a SQL statement typed against production.
 *
 * The property that matters is what "reset" has to mean. Clearing the seed
 * without clearing the flag would leave an account that demands a second
 * factor it no longer has - locked out permanently rather than re-enrolling -
 * and that failure is silent until somebody tries to sign in.
 */
describe("resetting a staff authenticator (FR-080, ADR 0016)", () => {
  it("FR-080: clears the seed and the flag together", async () => {
    const db = testDbClient();
    const staff = await seedStaff(db, "staff_owner");

    const cleared = await clearStaffTotpEnrolment(db, staff.id);

    expect(cleared).not.toBeNull();

    const [after] = await db
      .select({
        totpSecret: members.totpSecret,
        totpEnabled: members.totpEnabled,
      })
      .from(members)
      .where(eq(members.id, staff.id));

    // Both, or the account demands a factor it cannot produce.
    expect(after!.totpSecret).toBeNull();
    expect(after!.totpEnabled).toBe(false);
  });

  it("FR-080: leaves the password and the account alone", async () => {
    // A reset of the second factor is not a reset of the first. If it changed
    // the password too, a staff member with a broken authenticator would also
    // lose the credential they still had.
    const db = testDbClient();
    const staff = await seedStaff(db, "staff_owner");

    await clearStaffTotpEnrolment(db, staff.id);

    const [after] = await db
      .select({ passwordHash: members.passwordHash, status: members.status })
      .from(members)
      .where(eq(members.id, staff.id));

    expect(after!.passwordHash).toBe(staff.passwordHash);
    expect(after!.status).toBe("active");
  });

  it("FR-080: the action ends every session the staff member holds", async () => {
    const db = testDbClient();
    const staff = await seedStaff(db, "staff_owner");

    expect(
      await db.select().from(sessions).where(eq(sessions.memberId, staff.id)),
    ).toHaveLength(1);

    await clearStaffTotpEnrolment(db, staff.id);
    await deleteSessionsByMemberId(db, staff.id);

    expect(
      await db.select().from(sessions).where(eq(sessions.memberId, staff.id)),
    ).toHaveLength(0);
  });

  it("ADR 0007: it refuses an id that is not staff", async () => {
    // Members hold no second factor. Naming one here is a mistake, and the
    // scoping is what keeps this button from reaching ordinary accounts.
    const db = testDbClient();
    const ordinary = await seedStaff(db, "member");

    expect(await clearStaffTotpEnrolment(db, ordinary.id)).toBeNull();
  });

  it("FR-080: an id that names nobody is refused rather than reported as done", async () => {
    const db = testDbClient();

    expect(
      await clearStaffTotpEnrolment(db, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});
