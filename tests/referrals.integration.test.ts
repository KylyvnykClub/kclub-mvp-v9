import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbClient } from "@/data/db.js";
import {
  expireOverdueReferrals,
  insertReferral,
  listReceivedReferralsForCompanies,
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
