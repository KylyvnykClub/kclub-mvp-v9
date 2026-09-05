import { beforeAll, describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import {
  findMemberByEmail,
  findMemberByPhone,
  registerMemberTx,
} from "@/data/identity.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

// Registration issues a card, and the card token derives from this secret.
beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-registration-secret";
});

let seq = 0;

async function register(db: DbClient, phone: string, email?: string | null) {
  seq += 1;
  await registerMemberTx(db, {
    phone,
    // Both identifiers, since ADR 0032 - except where a case is deliberately
    // about an account that predates the rule and holds none.
    email: email === undefined ? `taken${seq}@example.com` : email,
    passwordHash: "hash",
    displayName: `Taken ${seq}`,
    country: "UA",
    language: "en",
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: [],
    cardSerial: `KCLUB-T${String(seq).padStart(5, "0")}`,
    sessionToken: crypto.randomUUID(),
  });
}

/**
 * The lookup behind "this number is already registered" (FR-001, ADR 0030).
 *
 * The disclosure itself is a decision, recorded in ADR 0030, and its safety
 * rests on the rate limit rather than on the answer. What has to hold here is
 * narrower and easy to get wrong: the answer must be about the number as
 * stored, so a member who registered as `+380671234567` is found by someone
 * typing `+38 067 123 45 67` — otherwise the check passes at step 1 and the
 * unique index refuses at the end, which is the failure this change exists to
 * remove.
 */
describe("registration checks the number before the form (FR-001, ADR 0030)", () => {
  it("FR-001: a registered number is found", async () => {
    const db = testDbClient();
    await register(db, "+380671110001");

    expect(await findMemberByPhone(db, "+380671110001")).toBeTruthy();
  });

  it("FR-001: an unregistered number is not", async () => {
    const db = testDbClient();

    expect(await findMemberByPhone(db, "+380671110002")).toBeFalsy();
  });

  it("ADR 0027: the check sees the same E.164 the form submits", async () => {
    // The form posts the hidden E.164 field, not what was typed, so the string
    // reaching this lookup is already normalised. If that ever stops being
    // true, this test fails rather than the registration silently letting a
    // duplicate through to the last screen.
    const db = testDbClient();
    await register(db, "+380671110003");

    expect(await findMemberByPhone(db, "+380671110003")).toBeTruthy();
    expect(await findMemberByPhone(db, "+380 67 111 0003")).toBeFalsy();
  });

  it("ADR 0005: the lookup answers about one number and returns no list", async () => {
    // Whatever the screen chooses to say, the data layer hands it a single
    // member or nothing - there is no shape here that could become a
    // directory.
    const db = testDbClient();
    await register(db, "+380671110004");

    const found = await findMemberByPhone(db, "+380671110004");

    expect(Array.isArray(found)).toBe(false);
    expect(found?.phone).toBe("+380671110004");
  });
});

/**
 * Both identifiers, and what happens when one of them is taken (FR-001,
 * ADR 0032).
 *
 * The schema is what makes the address mandatory - `registration-schema.test.ts`
 * proves that - and the unique index is what makes it exclusive. This is the
 * second half: two members cannot hold one address, and the accounts that
 * predate the rule and hold none are still legal rows.
 */
describe("registration holds a phone number and an address (FR-001, ADR 0032)", () => {
  it("FR-001: a registration stores both identifiers", async () => {
    const db = testDbClient();
    await register(db, "+380671110010", "both@example.com");

    const byPhone = await findMemberByPhone(db, "+380671110010");
    const byEmail = await findMemberByEmail(db, "both@example.com");

    expect(byPhone?.id).toBe(byEmail?.id);
    expect(byPhone?.email).toBe("both@example.com");
  });

  it("FR-001: the address is stored unproved, so it cannot yet sign anyone in", async () => {
    const db = testDbClient();
    await register(db, "+380671110011", "unproved@example.com");

    const member = await findMemberByEmail(db, "unproved@example.com");

    expect(member?.emailVerifiedAt).toBeNull();
  });

  it("FR-001: a second member cannot take an address already held", async () => {
    const db = testDbClient();
    await register(db, "+380671110012", "only-one@example.com");

    await expect(
      register(db, "+380671110013", "only-one@example.com"),
    ).rejects.toThrow();
  });

  it("ADR 0032: accounts predating the rule hold no address and are still valid", async () => {
    // `members.email` stays nullable on purpose: enforcing the requirement in
    // the database would have meant a destructive migration against the nine
    // accounts that were registered before it existed.
    const db = testDbClient();
    await register(db, "+380671110014", null);

    expect(await findMemberByPhone(db, "+380671110014")).toBeTruthy();
  });
});
