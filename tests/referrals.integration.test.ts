import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import {
  countReferralsByStatus,
  countReferralsForAdmin,
  expireOverdueReferrals,
  insertReferral,
  listPendingReviewReferrals,
  listReceivedReferralsForCompanies,
  listReferralsForAdmin,
  respondToReferral,
  setMemberReferralPermission,
  setReferralModeration,
} from "@/data/referrals.js";
import {
  businessCategories,
  companies,
  members,
  referrals,
  subscriptions,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient, suffix: string) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15556${suffix}`,
      passwordHash: "hash",
      displayName: `Referral ${suffix}`,
      country: "US",
      language: "en",
      role: "partner_owner",
      status: "active",
    })
    .returning();

  return member!;
}

async function seedCompany(db: DbClient, ownerId: string, suffix: string) {
  await db
    .insert(businessCategories)
    .values({
      id: Number(`8${suffix}`),
      block: "Services",
      category: "Consulting",
      subcategory: `Referral ${suffix}`,
      status: "ACTIVE",
    })
    .onConflictDoNothing();

  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      businessCategoryId: Number(`8${suffix}`),
      name: `Referral Company ${suffix}`,
      slug: `referral-company-${suffix}`,
      country: "US",
      city: "New York",
      moderationStatus: "approved",
    })
    .returning();

  await db.insert(subscriptions).values({
    memberId: ownerId,
    companyId: company!.id,
    stripeCustomerId: `cus_${suffix}`,
    stripeSubscriptionId: `sub_${suffix}`,
    status: "active",
    priceId: `price_${suffix}`,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  return company!;
}

describe("referral lifecycle (FR-074, FR-075, FR-077, FR-078)", () => {
  it("hides pending moderation referrals from recipients until delivered", async () => {
    const db = testDbClient();
    const sender = await seedMember(db, "100001");
    const recipientOwner = await seedMember(db, "100002");
    const recipientCompany = await seedCompany(db, recipientOwner.id, "100001");

    const referral = await insertReferral(db, {
      senderId: sender.id,
      recipientCompanyId: recipientCompany.id,
      clientName: "Pending Client",
      contactChannel: "pending@example.com",
      serviceNeeded: "Private service",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await expect(
      listReceivedReferralsForCompanies(db, [recipientCompany.id]),
    ).resolves.toHaveLength(0);

    await db
      .update(referrals)
      .set({ status: "delivered" })
      .where(eq(referrals.id, referral.id));

    const received = await listReceivedReferralsForCompanies(db, [
      recipientCompany.id,
    ]);
    expect(received.map((row) => row.id)).toEqual([referral.id]);
  });

  it("redacts client contact details when declined or expired", async () => {
    const db = testDbClient();
    const sender = await seedMember(db, "100003");
    const recipientOwner = await seedMember(db, "100004");
    const recipientCompany = await seedCompany(db, recipientOwner.id, "100002");

    const declined = await insertReferral(db, {
      senderId: sender.id,
      recipientCompanyId: recipientCompany.id,
      clientName: "Declined Client",
      contactChannel: "declined@example.com",
      serviceNeeded: "Declined service",
      status: "delivered",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await respondToReferral(db, declined.id, "declined", true);
    const declinedRow = await db.query.referrals.findFirst({
      where: (table, { eq }) => eq(table.id, declined.id),
    });
    expect(declinedRow?.contactChannel).toBeNull();
    expect(declinedRow?.clientName).toBe("[Deleted]");

    const expired = await insertReferral(db, {
      senderId: sender.id,
      recipientCompanyId: recipientCompany.id,
      clientName: "Expired Client",
      contactChannel: "expired@example.com",
      serviceNeeded: "Expired service",
      status: "delivered",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
    });

    // A referral staff never moderated is just as "not acted on" as one
    // that was delivered and never answered - it must expire too.
    const neverModerated = await insertReferral(db, {
      senderId: sender.id,
      recipientCompanyId: recipientCompany.id,
      clientName: "Unmoderated Client",
      contactChannel: "unmoderated@example.com",
      serviceNeeded: "Unmoderated service",
      status: "pending_review",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() - 60_000),
    });

    // Asserted as a floor, not an exact count: expireOverdueReferrals sweeps
    // the whole table, not just this test's rows, so it can only be pinned
    // to >= the referrals this test itself put in an overdue state.
    await expect(
      expireOverdueReferrals(db, new Date()),
    ).resolves.toBeGreaterThanOrEqual(2);

    const expiredRow = await db.query.referrals.findFirst({
      where: (table, { eq }) => eq(table.id, expired.id),
    });
    expect(expiredRow?.status).toBe("expired");
    expect(expiredRow?.contactChannel).toBeNull();

    const neverModeratedRow = await db.query.referrals.findFirst({
      where: (table, { eq }) => eq(table.id, neverModerated.id),
    });
    expect(neverModeratedRow?.status).toBe("expired");
    expect(neverModeratedRow?.contactChannel).toBeNull();
    expect(neverModeratedRow?.clientName).toBe("[Deleted due to expiration]");
  });

  it("redacts client contact details when staff rejects a referral (FR-077, ADR-0009)", async () => {
    const db = testDbClient();
    const sender = await seedMember(db, "100006");
    const recipientOwner = await seedMember(db, "100007");
    const recipientCompany = await seedCompany(db, recipientOwner.id, "100003");
    const moderator = await seedMember(db, "100008");

    const referral = await insertReferral(db, {
      senderId: sender.id,
      recipientCompanyId: recipientCompany.id,
      clientName: "Rejected Client",
      contactChannel: "rejected@example.com",
      serviceNeeded: "Rejected service",
      status: "pending_review",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await setReferralModeration(
      db,
      referral.id,
      "rejected",
      moderator.id,
      "Not a genuine client introduction",
    );

    const rejectedRow = await db.query.referrals.findFirst({
      where: (table, { eq }) => eq(table.id, referral.id),
    });
    expect(rejectedRow?.status).toBe("rejected");
    expect(rejectedRow?.contactChannel).toBeNull();
    expect(rejectedRow?.clientName).toBe("[Deleted]");
  });

  it("bars and unbars a sender from sending referrals", async () => {
    const db = testDbClient();
    const sender = await seedMember(db, "100005");

    const barred = await setMemberReferralPermission(db, sender.id, false);
    expect(barred?.canSendReferrals).toBe(false);

    const unbarred = await setMemberReferralPermission(db, sender.id, true);
    expect(unbarred?.canSendReferrals).toBe(true);
  });
});

/**
 * The staff introductions directory. Not an FR of its own - it is how the
 * FR-072/FR-075 moderation queue is reached once the screen shows every status
 * rather than only the ones waiting for review.
 */
describe("admin introductions directory: statuses, search and counts", () => {
  async function seedTriple(db: DbClient, suffix: string) {
    const sender = await seedMember(db, `9${suffix}1`);
    const owner = await seedMember(db, `9${suffix}2`);
    const company = await seedCompany(db, owner.id, `9${suffix}`);

    const base = {
      senderId: sender.id,
      recipientCompanyId: company.id,
      clientName: "Directory Client",
      contactChannel: "client@example.com",
      serviceNeeded: "Tax advice",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    };

    return { sender, company, base };
  }

  it("returns introductions in every status, while the queue query still returns only those in review", async () => {
    const db = testDbClient();
    const { company, base } = await seedTriple(db, "01");

    await insertReferral(db, base);
    await insertReferral(db, { ...base, status: "delivered" });
    await insertReferral(db, { ...base, status: "expired" });

    const rows = await listReferralsForAdmin(db, { query: company.name });
    expect(rows.map((row) => row.status).sort()).toEqual([
      "delivered",
      "expired",
      "pending_review",
    ]);

    const queue = await listPendingReviewReferrals(db);
    expect(
      queue.filter((row) => row.recipientCompanyId === company.id),
    ).toHaveLength(1);
  });

  it("narrows to one status and counts every status under the same search", async () => {
    const db = testDbClient();
    const { company, base } = await seedTriple(db, "02");

    await insertReferral(db, base);
    await insertReferral(db, base);
    await insertReferral(db, { ...base, status: "accepted" });

    const filters = { query: company.name };
    await expect(countReferralsForAdmin(db, filters)).resolves.toBe(3);
    await expect(
      countReferralsForAdmin(db, { ...filters, status: "pending_review" }),
    ).resolves.toBe(2);
    await expect(countReferralsByStatus(db, filters)).resolves.toEqual({
      pending_review: 2,
      delivered: 0,
      accepted: 1,
      declined: 0,
      rejected: 0,
      expired: 0,
    });
  });

  it("finds an introduction by its sender as well as by its recipient company, and pages without repeating a row", async () => {
    const db = testDbClient();
    const { sender, company, base } = await seedTriple(db, "03");

    const seeded = [];
    for (let index = 0; index < 3; index += 1) {
      seeded.push(await insertReferral(db, base));
    }

    await expect(
      countReferralsForAdmin(db, { query: sender.displayName }),
    ).resolves.toBe(3);
    await expect(
      countReferralsForAdmin(db, { query: company.name }),
    ).resolves.toBe(3);

    const first = await listReferralsForAdmin(
      db,
      { query: company.name },
      { limit: 2, offset: 0 },
    );
    const second = await listReferralsForAdmin(
      db,
      { query: company.name },
      { limit: 2, offset: 2 },
    );

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((row) => row.id))).toEqual(
      new Set(seeded.map((row) => row.id)),
    );
  });
});
