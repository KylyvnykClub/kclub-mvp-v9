import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  findCardByMemberId,
  findCardPublicByToken,
  insertCard,
  revokeCardById,
  revokeValidCardsByMemberId,
} from "@/data/members.js";
import { registerMemberTx } from "@/data/identity.js";
import { cards, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * The membership card, FR-020 to FR-026.
 *
 * The card is the only object a member shows to a stranger, so the properties
 * that matter are what it carries, what a reissue does to the card it replaces,
 * and how quickly a tier change reaches it.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-card-token-secret";
});

/** A Ukrainian mobile number nobody else in the run holds. */
function uaPhone() {
  return `+38050${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

async function registerWithCard(db: DbClient, phone = uaPhone()) {
  await registerMemberTx(db, {
    phone,
    email: null,
    passwordHash: "hash",
    displayName: "Card Holder",
    country: "UA",
    language: "en",
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: [],
    sessionToken: crypto.randomUUID(),
  });

  const member = await db.query.members.findFirst({
    where: eq(members.phone, phone),
  });

  const card = await findCardByMemberId(db, member!.id);
  return { member: member!, serial: card!.serial };
}

describe("FR-020: a card is issued automatically with the account", () => {
  it("creates exactly one card, valid and free, without a separate step", async () => {
    const db = testDbClient();
    const { member, serial } = await registerWithCard(db);

    const rows = await db
      .select()
      .from(cards)
      .where(eq(cards.memberId, member.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.serial).toBe(serial);
    expect(rows[0]?.status).toBe("valid");
    expect(rows[0]?.tier).toBe("free");
    expect(rows[0]?.issuedAt).toBeInstanceOf(Date);
  });

  it("prints the phone's country and a number from 10001 up, as UA-10001", async () => {
    const db = testDbClient();
    const { serial } = await registerWithCard(db);

    expect(serial).toMatch(/^UA-\d{5,}$/);
    expect(Number(serial.slice(3))).toBeGreaterThanOrEqual(10001);
  });

  it("takes the country from the phone even when the residence differs", async () => {
    const db = testDbClient();
    const phone = `+1201555${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;
    const { serial } = await registerWithCard(db, phone);

    expect(serial).toMatch(/^US-\d{5,}$/);
  });

  it("draws one club-wide sequence, so no two cards share a number", async () => {
    const db = testDbClient();
    const first = await registerWithCard(db);
    const second = await registerWithCard(db);

    expect(Number(second.serial.slice(3))).toBeGreaterThan(
      Number(first.serial.slice(3)),
    );
  });

  it("refuses a duplicate serial at the database, as the backstop", async () => {
    const db = testDbClient();
    const { serial } = await registerWithCard(db);
    const { member } = await registerWithCard(db);

    await expect(
      db.update(cards).set({ serial }).where(eq(cards.memberId, member.id)),
    ).rejects.toThrow();
  });
});

describe("FR-021: the card carries what the member area has to display", () => {
  it("returns the tier, the serial and a QR token for the owner", async () => {
    const db = testDbClient();
    const { member, serial } = await registerWithCard(db);

    const card = await findCardByMemberId(db, member.id);

    expect(card?.serial).toBe(serial);
    expect(card?.tier).toBe("free");
    expect(card?.status).toBe("valid");
    // The QR token is derived from the card id, never stored raw (FR-022).
    expect(card?.token).toMatch(new RegExp(`^card_v1_${card!.id}_.+`));
  });

  it("returns null for a member who has no card", async () => {
    const db = testDbClient();
    const [orphan] = await db
      .insert(members)
      .values({
        phone: `+15553${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: "hash",
        displayName: "No Card",
        country: "UA",
        language: "en",
        role: "member",
        status: "active",
      })
      .returning();

    expect(await findCardByMemberId(db, orphan!.id)).toBeNull();
  });
});

describe("FR-025: a reissue invalidates the previous QR token immediately", () => {
  it("revokes the card being replaced", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);
    const original = await findCardByMemberId(db, member.id);

    await revokeValidCardsByMemberId(db, member.id);
    await insertCard(db, {
      memberId: member.id,
      tier: "vip",
    });

    const replaced = await db.query.cards.findFirst({
      where: eq(cards.id, original!.id),
    });
    expect(replaced?.status).toBe("revoked");
  });

  it("makes the old QR token verify as revoked rather than as a live card", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);
    const original = await findCardByMemberId(db, member.id);
    const oldToken = original!.token;

    expect((await findCardPublicByToken(db, oldToken))?.status).toBe("valid");

    await revokeValidCardsByMemberId(db, member.id);
    await insertCard(db, {
      memberId: member.id,
      tier: "free",
    });

    // The token is derived from the card id and cannot be withdrawn, so the
    // guarantee is that it now reports the card as revoked.
    expect((await findCardPublicByToken(db, oldToken))?.status).toBe("revoked");
  });

  it("leaves the member holding exactly one valid card after a reissue", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);

    await revokeValidCardsByMemberId(db, member.id);
    await insertCard(db, {
      memberId: member.id,
      tier: "vip",
    });

    const rows = await db
      .select()
      .from(cards)
      .where(eq(cards.memberId, member.id));

    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === "valid")).toHaveLength(1);
  });

  it("shows the new card, not the revoked one, once a member holds both", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);
    await revokeValidCardsByMemberId(db, member.id);
    const replacement = await insertCard(db, {
      memberId: member.id,
      tier: "vip",
    });
    const replacementSerial = replacement.serial;

    const current = await findCardByMemberId(db, member.id);

    expect(current?.serial).toBe(replacementSerial);
    expect(current?.status).toBe("valid");
    expect(current?.tier).toBe("vip");
  });

  it("does not touch another member's cards", async () => {
    const db = testDbClient();
    const mine = await registerWithCard(db);
    const theirs = await registerWithCard(db);

    await revokeValidCardsByMemberId(db, mine.member.id);

    const other = await findCardByMemberId(db, theirs.member.id);
    expect(other?.status).toBe("valid");
  });

  it("revokes a single card by id, leaving the QR readable but revoked", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);
    const card = await findCardByMemberId(db, member.id);

    await revokeCardById(db, card!.id);

    const verified = await findCardPublicByToken(db, card!.token);
    expect(verified?.status).toBe("revoked");
    expect(verified?.serial).toBe(card!.serial);
  });
});

describe("FR-026: the card reflects a tier change without a cache in the way", () => {
  it("reports the new tier on the next read after the projection writes it", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);

    expect((await findCardByMemberId(db, member.id))?.tier).toBe("free");

    // What the billing projection does when a subscription becomes active
    // (proved end to end in billing-projection.integration.test.ts, FR-052).
    await db
      .update(cards)
      .set({ tier: "vip" })
      .where(eq(cards.memberId, member.id));

    // No cache, no revalidation window: the very next read is already correct,
    // which is what keeps FR-026 inside its 60-second budget.
    expect((await findCardByMemberId(db, member.id))?.tier).toBe("vip");
  });

  it("demotes as readily as it promotes", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);

    await db
      .update(cards)
      .set({ tier: "vip" })
      .where(eq(cards.memberId, member.id));
    await db
      .update(cards)
      .set({ tier: "free" })
      .where(eq(cards.memberId, member.id));

    expect((await findCardByMemberId(db, member.id))?.tier).toBe("free");
  });

  it("shows the tier on the public verification page too", async () => {
    const db = testDbClient();
    const { member } = await registerWithCard(db);
    const card = await findCardByMemberId(db, member.id);

    await db
      .update(cards)
      .set({ tier: "vip" })
      .where(eq(cards.memberId, member.id));

    expect((await findCardPublicByToken(db, card!.token))?.tier).toBe("vip");
  });
});
