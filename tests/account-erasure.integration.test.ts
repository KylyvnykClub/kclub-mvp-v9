import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  ACCOUNT_ERASURE_DAYS,
  ERASED_DISPLAY_NAME,
  accountErasureCutoff,
  eraseMemberTx,
  erasedPhone,
  findMembersDueForErasure,
} from "@/data/account-erasure.js";
import { insertStripeCustomerMapping } from "@/data/billing.js";
import { createBusinessCategory } from "@/data/companies.js";
import { registerMemberTx } from "@/data/identity.js";
import { findCardPublicByToken } from "@/data/members.js";
import {
  accountDeletionRequests,
  cards,
  companies,
  members,
  referrals,
  sessions,
  subscriptions,
} from "@/data/schema/index.js";
import { eraseStripeCustomerForMember } from "@/modules/billing/erasure.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-009: a member may request deletion, and it must complete within 30 days.
 *
 * The request half is covered under FR-098 in account-deletion.integration.
 * This is the half that closes it - the erasure the 30-day clock runs out on,
 * and the shape of what is deliberately left behind (data-storage.md §4).
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "integration-erasure-secret";
});

let seq = 0;

async function seedMemberWithRequest(
  db: DbClient,
  options: { requestedDaysAgo?: number } = {},
) {
  seq += 1;
  const phone = `+3806020${String(1000 + seq).slice(-4)}`;
  const token = crypto.randomUUID();

  await registerMemberTx(db, {
    phone,
    email: null,
    passwordHash: "argon2id$hash",
    displayName: "Leaving Member",
    country: "UA",
    language: "en",
    userAgent: "test",
    ipAddress: "127.0.0.1",
    consents: [],
    cardSerial: `KCLUB-E${String(seq).padStart(5, "0")}`,
    sessionToken: token,
  });

  const member = (await db.query.members.findFirst({
    where: eq(members.phone, phone),
  }))!;

  if (options.requestedDaysAgo !== undefined) {
    await db.insert(accountDeletionRequests).values({
      memberId: member.id,
      requestedAt: new Date(
        Date.now() - options.requestedDaysAgo * 24 * 60 * 60 * 1000,
      ),
      subscriptionChoices: [],
    });
    await db
      .update(members)
      .set({ status: "pending_deletion" })
      .where(eq(members.id, member.id));
  }

  return { member, phone, token };
}

describe("FR-009: the 30-day clock decides who is erased", () => {
  it("selects a member whose request is older than the retention period", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: ACCOUNT_ERASURE_DAYS + 1,
    });

    const due = await findMembersDueForErasure(db, new Date());

    expect(due.map((row) => row.memberId)).toContain(member.id);
  });

  it("leaves a member still inside the window alone", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: ACCOUNT_ERASURE_DAYS - 1,
    });

    const due = await findMembersDueForErasure(db, new Date());

    expect(due.map((row) => row.memberId)).not.toContain(member.id);
  });

  it("ignores a member who never requested deletion", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db);

    const due = await findMembersDueForErasure(db, new Date());

    expect(due.map((row) => row.memberId)).not.toContain(member.id);
  });

  it("does not select a member who has already been erased", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: ACCOUNT_ERASURE_DAYS + 5,
    });

    await eraseMemberTx(db, member.id, new Date());
    const due = await findMembersDueForErasure(db, new Date());

    expect(due.map((row) => row.memberId)).not.toContain(member.id);
  });

  it("measures the cutoff as 30 days before now", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");

    expect(accountErasureCutoff(now).toISOString()).toBe(
      "2026-07-16T00:00:00.000Z",
    );
  });
});

describe("FR-009: what the erasure destroys", () => {
  it("replaces the phone with a value that identifies nobody and stays unique", async () => {
    const db = testDbClient();
    const { member, phone } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });

    await eraseMemberTx(db, member.id, new Date());

    const erased = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(erased?.phone).not.toBe(phone);
    expect(erased?.phone).toBe(erasedPhone(member.id));
    expect(erased!.phone.length).toBeLessThanOrEqual(20);
  });

  it("writes the same placeholder if the erasure is run twice", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });

    await eraseMemberTx(db, member.id, new Date());
    await eraseMemberTx(db, member.id, new Date());

    const erased = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(erased?.phone).toBe(erasedPhone(member.id));
  });

  it("destroys the password hash, the display name and the second factor", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });
    await db
      .update(members)
      .set({ totpSecret: "SECRET", totpEnabled: true })
      .where(eq(members.id, member.id));

    await eraseMemberTx(db, member.id, new Date());

    const erased = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(erased?.passwordHash).toBe("");
    expect(erased?.displayName).toBe(ERASED_DISPLAY_NAME);
    expect(erased?.totpSecret).toBeNull();
    expect(erased?.totpEnabled).toBe(false);
  });

  it("deletes every session, so the account cannot be used again", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });

    await eraseMemberTx(db, member.id, new Date());

    expect(
      await db.select().from(sessions).where(eq(sessions.memberId, member.id)),
    ).toHaveLength(0);
  });

  it("revokes the card and overwrites its QR token", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });

    const before = (await db.query.cards.findFirst({
      where: eq(cards.memberId, member.id),
    }))!;

    await eraseMemberTx(db, member.id, new Date());

    const after = (await db.query.cards.findFirst({
      where: eq(cards.memberId, member.id),
    }))!;

    expect(after.status).toBe("revoked");
    expect(after.token).not.toBe(before.token);
    expect(after.tokenHash).toBeNull();
  });

  it("stops the old QR from resolving to a person", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });
    const card = (await db.query.cards.findFirst({
      where: eq(cards.memberId, member.id),
    }))!;

    await eraseMemberTx(db, member.id, new Date());

    const verified = await findCardPublicByToken(db, card.token);
    expect(verified?.memberName ?? ERASED_DISPLAY_NAME).toBe(
      ERASED_DISPLAY_NAME,
    );
  });

  it("clears the client contact details this member submitted", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });
    const recipient = await seedMemberWithRequest(db);

    // A referral needs a recipient company; any approved one will do.
    const category = await createBusinessCategory(db, {
      block: "Services",
      category: "Consulting",
      subcategory: `Erasure ${seq}`,
    });

    const [company] = await db
      .insert(companies)
      .values({
        ownerId: recipient.member.id,
        businessCategoryId: category.id,
        name: `Erasure Company ${seq}`,
        slug: `erasure-company-${seq}`,
        country: "UA",
        city: "Kyiv",
        moderationStatus: "approved",
      })
      .returning();

    await db.insert(referrals).values({
      senderId: member.id,
      recipientCompanyId: company!.id,
      clientName: "A Real Person",
      contactChannel: "person@example.com",
      serviceNeeded: "Advice",
      note: "Prefers mornings",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });

    await eraseMemberTx(db, member.id, new Date());

    const sent = await db
      .select()
      .from(referrals)
      .where(eq(referrals.senderId, member.id));

    expect(sent[0]?.clientName).toBe(ERASED_DISPLAY_NAME);
    expect(sent[0]?.contactChannel).toBeNull();
    expect(sent[0]?.note).toBeNull();
  });
});

function fakeStripeDeps() {
  const cancelled: string[] = [];
  const deleted: string[] = [];
  return {
    deps: {
      cancelSubscription: (id: string) => {
        cancelled.push(id);
        return Promise.resolve();
      },
      deleteCustomer: (id: string) => {
        deleted.push(id);
        return Promise.resolve();
      },
    },
    cancelled,
    deleted,
  };
}

describe("FR-009: the Stripe Customer is deleted through the API (data-storage.md §4 step 4)", () => {
  it("does nothing for a member who never subscribed to anything", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db);
    const { deps, cancelled, deleted } = fakeStripeDeps();

    await eraseStripeCustomerForMember(db, deps, member.id);

    expect(cancelled).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("deletes the customer directly when there is no active subscription", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db);
    const stripeCustomerId = `cus_${crypto.randomUUID()}`;
    await insertStripeCustomerMapping(db, member.id, stripeCustomerId);
    const { deps, cancelled, deleted } = fakeStripeDeps();

    await eraseStripeCustomerForMember(db, deps, member.id);

    expect(cancelled).toEqual([]);
    expect(deleted).toEqual([stripeCustomerId]);
  });

  it("cancels every active or past-due subscription before deleting the customer", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db);
    const stripeCustomerId = `cus_${crypto.randomUUID()}`;
    await insertStripeCustomerMapping(db, member.id, stripeCustomerId);

    const active = `sub_active_${crypto.randomUUID()}`;
    const pastDue = `sub_pastdue_${crypto.randomUUID()}`;
    const alreadyCancelled = `sub_cancelled_${crypto.randomUUID()}`;

    for (const [stripeSubscriptionId, status] of [
      [active, "active"],
      [pastDue, "past_due"],
      [alreadyCancelled, "canceled"],
    ] as const) {
      await db.insert(subscriptions).values({
        stripeSubscriptionId,
        memberId: member.id,
        stripeCustomerId,
        status,
        priceId: "price_vip",
        currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
      });
    }

    const { deps, cancelled, deleted } = fakeStripeDeps();

    await eraseStripeCustomerForMember(db, deps, member.id);

    // Only the not-yet-terminal subscriptions are cancelled - a subscription
    // already canceled in Stripe would error if cancelled again.
    expect(cancelled.sort()).toEqual([active, pastDue].sort());
    expect(deleted).toEqual([stripeCustomerId]);
  });
});

describe("FR-009: what the erasure deliberately keeps", () => {
  it("keeps the member row, so payment and audit records keep a valid key", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });

    await eraseMemberTx(db, member.id, new Date());

    const erased = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(erased).toBeDefined();
    expect(erased?.id).toBe(member.id);
  });

  it("keeps the country and the registration month for revenue reporting", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });

    await eraseMemberTx(db, member.id, new Date());

    const erased = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(erased?.country).toBe("UA");
    expect(erased?.createdAt).toEqual(member.createdAt);
  });

  it("marks when the erasure happened", async () => {
    const db = testDbClient();
    const { member } = await seedMemberWithRequest(db, {
      requestedDaysAgo: 31,
    });
    const erasedAt = new Date();

    await eraseMemberTx(db, member.id, erasedAt);

    const erased = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });

    expect(erased?.deletedAt).toEqual(erasedAt);
  });

  it("does not touch another member", async () => {
    const db = testDbClient();
    const leaving = await seedMemberWithRequest(db, { requestedDaysAgo: 31 });
    const staying = await seedMemberWithRequest(db);

    await eraseMemberTx(db, leaving.member.id, new Date());

    const untouched = await db.query.members.findFirst({
      where: eq(members.id, staying.member.id),
    });

    expect(untouched?.phone).toBe(staying.phone);
    expect(untouched?.displayName).toBe("Leaving Member");
    expect(untouched?.deletedAt).toBeNull();
  });
});
