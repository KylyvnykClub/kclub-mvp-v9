import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import {
  createBusinessCategory,
  listApprovedCompaniesWithSubscriptionsByOwner,
} from "@/data/companies.js";
import {
  insertReferral,
  listReferralsSince,
  listSentReferrals,
} from "@/data/referrals.js";
import {
  checkReferralLimits,
  referralWindowStart,
} from "@/lib/referral-limits.js";
import { companies, members, subscriptions } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * Sending a client referral: FR-070, FR-072, FR-073 and FR-076.
 *
 * The lifecycle after moderation is covered in referrals.integration.test.ts.
 * This is the half before it - who may send, what is recorded about consent,
 * how the rolling limits behave against real rows, and what the sender is
 * allowed to see afterwards.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

let seq = 0;

function nextSuffix() {
  seq += 1;
  return String(90000 + seq);
}

async function seedMember(db: DbClient) {
  const suffix = nextSuffix();
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15552${suffix}`,
      passwordHash: "hash",
      displayName: `Sender ${suffix}`,
      country: "UA",
      language: "en",
      role: "partner_owner",
      status: "active",
    })
    .returning();

  return member!;
}

async function seedCompany(
  db: DbClient,
  ownerId: string,
  options: { subscriptionStatus?: string | null; approved?: boolean } = {},
) {
  const suffix = nextSuffix();
  const category = await createBusinessCategory(db, {
    block: "Services",
    category: "Consulting",
    subcategory: `Sending ${suffix}`,
  });

  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      businessCategoryId: category.id,
      name: `Sending Company ${suffix}`,
      slug: `sending-company-${suffix}`,
      country: "UA",
      city: "Kyiv",
      moderationStatus: options.approved === false ? "pending" : "approved",
    })
    .returning();

  if (options.subscriptionStatus !== null) {
    await db.insert(subscriptions).values({
      memberId: ownerId,
      companyId: company!.id,
      stripeCustomerId: `cus_s${suffix}`,
      stripeSubscriptionId: `sub_s${suffix}`,
      status: options.subscriptionStatus ?? "active",
      priceId: `price_s${suffix}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  return company!;
}

async function send(
  db: DbClient,
  senderId: string,
  recipientCompanyId: string,
  overrides: { createdAt?: Date; status?: "pending_review" | "delivered" } = {},
) {
  return insertReferral(db, {
    senderId,
    recipientCompanyId,
    clientName: "A Client",
    contactChannel: "client@example.com",
    serviceNeeded: "Tax advice",
    note: "Prefers mornings",
    consentAttested: true,
    consentTimestamp: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    ...(overrides.status ? { status: overrides.status } : {}),
  });
}

describe("FR-070: only a VIP with a published company may send a referral", () => {
  it("finds a published company for an owner whose listing is paid", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);
    await seedCompany(db, owner.id);

    const owned = await listApprovedCompaniesWithSubscriptionsByOwner(
      db,
      owner.id,
    );

    expect(
      owned.some((company) =>
        company.subscriptions.some((sub) => sub.status === "active"),
      ),
    ).toBe(true);
  });

  it("finds none when the company is approved but the listing is unpaid", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);
    await seedCompany(db, owner.id, { subscriptionStatus: null });

    const owned = await listApprovedCompaniesWithSubscriptionsByOwner(
      db,
      owner.id,
    );

    expect(
      owned.some((company) =>
        company.subscriptions.some((sub) => sub.status === "active"),
      ),
    ).toBe(false);
  });

  it("finds none when the listing subscription has been cancelled", async () => {
    const db = testDbClient();
    const owner = await seedMember(db);
    await seedCompany(db, owner.id, { subscriptionStatus: "canceled" });

    const owned = await listApprovedCompaniesWithSubscriptionsByOwner(
      db,
      owner.id,
    );

    expect(
      owned.some((company) =>
        company.subscriptions.some((sub) => sub.status === "active"),
      ),
    ).toBe(false);
  });
});

describe("FR-072: the consent attestation is stored with the referral", () => {
  it("records the attestation, when it was made, and who made it", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    const referral = await send(db, sender.id, recipient.id);

    expect(referral.consentAttested).toBe(true);
    expect(referral.consentTimestamp).toBeInstanceOf(Date);
    expect(referral.senderId).toBe(sender.id);
  });

  it("defaults to not attested, so an insert that omits it cannot claim consent", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    const referral = await insertReferral(db, {
      senderId: sender.id,
      recipientCompanyId: recipient.id,
      clientName: "A Client",
      serviceNeeded: "Tax advice",
      expiresAt: new Date(Date.now() + 1000),
    });

    expect(referral.consentAttested).toBe(false);
    expect(referral.consentTimestamp).toBeNull();
  });
});

describe("FR-073: the rolling limits count real rows", () => {
  it("counts only referrals inside the window", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    await send(db, sender.id, recipient.id, {
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await send(db, sender.id, recipient.id);

    const recent = await listReferralsSince(
      db,
      sender.id,
      referralWindowStart(new Date()),
    );

    expect(recent).toHaveLength(1);
  });

  it("counts only the sender's own referrals", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const someoneElse = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    await send(db, someoneElse.id, recipient.id);
    await send(db, someoneElse.id, recipient.id);
    await send(db, sender.id, recipient.id);

    const recent = await listReferralsSince(
      db,
      sender.id,
      referralWindowStart(new Date()),
    );

    expect(recent).toHaveLength(1);
  });

  it("closes the door on the fourth referral to the same company", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    for (let i = 0; i < 3; i += 1) {
      await send(db, sender.id, recipient.id);
    }

    const recent = await listReferralsSince(
      db,
      sender.id,
      referralWindowStart(new Date()),
    );

    expect(checkReferralLimits(recent, recipient.id)).toEqual({
      exceeded: true,
      limit: "per_recipient",
    });
  });
});

describe("FR-076: the sender sees the status of every referral they sent", () => {
  it("returns the sender's referrals whatever state they are in", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    await send(db, sender.id, recipient.id, { status: "pending_review" });
    await send(db, sender.id, recipient.id, { status: "delivered" });

    const sent = await listSentReferrals(db, sender.id);
    const statuses = sent.map((referral) => referral.status).sort();

    expect(sent).toHaveLength(2);
    expect(statuses).toEqual(["delivered", "pending_review"]);
  });

  it("shows a referral while it is still awaiting moderation, unlike the recipient's view", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    await send(db, sender.id, recipient.id, { status: "pending_review" });

    const sent = await listSentReferrals(db, sender.id);
    expect(sent[0]?.status).toBe("pending_review");
  });

  it("does not return another member's referrals", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const someoneElse = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    await send(db, someoneElse.id, recipient.id);

    expect(await listSentReferrals(db, sender.id)).toHaveLength(0);
  });

  it("names the recipient company, which is public catalogue data", async () => {
    const db = testDbClient();
    const sender = await seedMember(db);
    const recipient = await seedCompany(db, (await seedMember(db)).id);

    await send(db, sender.id, recipient.id);

    const sent = await listSentReferrals(db, sender.id);
    expect(sent[0]?.recipientCompany?.name).toBe(recipient.name);
  });
});
