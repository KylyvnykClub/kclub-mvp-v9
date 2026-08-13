import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db, DbClient } from "@/data/db.js";
import { requestAccountDeletionTx } from "@/data/account-deletion.js";
import { listActiveSubscriptionsForDeletion } from "@/data/billing.js";
import {
  accountDeletionRequests,
  businessCategories,
  cards,
  companies,
  members,
  sessions,
  subscriptions,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

function testDb(): Db {
  return getTestDb() as unknown as Db;
}

async function seedMember(db: DbClient) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+1555${Math.floor(1_000_000 + Math.random() * 8_000_000)}`,
      passwordHash: "hash",
      displayName: "Delete Me",
      country: "US",
      language: "en",
    })
    .returning();

  await db.insert(cards).values({
    memberId: member!.id,
    serial: `KCLUB-${Math.floor(100_000 + Math.random() * 900_000)}`,
    token: `tok-${crypto.randomUUID()}`,
    tier: "vip",
  });

  await db.insert(sessions).values({
    memberId: member!.id,
    token: `session-${crypto.randomUUID()}`,
    tokenHash: `session-hash-${crypto.randomUUID()}`,
    userAgent: "test",
    ipAddress: "127.0.0.1",
  });

  return member!;
}

async function seedCompany(db: DbClient, memberId: string) {
  const categoryId = Math.floor(100_000 + Math.random() * 900_000);
  await db.insert(businessCategories).values({
    id: categoryId,
    block: "Services",
    category: "Consulting",
    subcategory: `Deletion ${categoryId}`,
  });

  const [company] = await db
    .insert(companies)
    .values({
      ownerId: memberId,
      businessCategoryId: categoryId,
      name: "Deletion Co",
      slug: `deletion-${crypto.randomUUID()}`,
      moderationStatus: "approved",
    })
    .returning();

  return company!;
}

async function seedSubscription(
  db: DbClient,
  memberId: string,
  input: { status: string; companyId?: string | null; priceId: string },
) {
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      memberId,
      companyId: input.companyId ?? null,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      status: input.status,
      priceId: input.priceId,
      currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
    })
    .returning();

  return subscription!;
}

describe("account deletion subscription choices (FR-098)", () => {
  it("lists only active subscriptions that require a delete-flow decision", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const company = await seedCompany(db, member.id);
    const vip = await seedSubscription(db, member.id, {
      status: "active",
      priceId: "price_vip",
    });
    const listing = await seedSubscription(db, member.id, {
      status: "past_due",
      companyId: company.id,
      priceId: "price_listing",
    });
    await seedSubscription(db, member.id, {
      status: "canceled",
      priceId: "price_old",
    });

    const active = await listActiveSubscriptionsForDeletion(db, member.id);

    expect(active.map((subscription) => subscription.id).sort()).toEqual(
      [vip.id, listing.id].sort(),
    );
    expect(
      active.find((subscription) => subscription.id === listing.id)?.company,
    ).toMatchObject({ id: company.id, name: company.name });
  });

  it("rejects deletion when any active subscription has no explicit choice", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    await seedSubscription(db, member.id, {
      status: "active",
      priceId: "price_vip",
    });

    await expect(
      requestAccountDeletionTx(testDb(), member.id, []),
    ).rejects.toThrow("Every active subscription requires a deletion decision");
  });

  it("records choices, marks pending_deletion, deletes sessions, and does not cancel subscriptions", async () => {
    const db = testDbClient();
    const member = await seedMember(db);
    const vip = await seedSubscription(db, member.id, {
      status: "active",
      priceId: "price_vip",
    });
    const listing = await seedSubscription(db, member.id, {
      status: "past_due",
      priceId: "price_listing",
    });

    await requestAccountDeletionTx(testDb(), member.id, [
      { subscriptionId: vip.id, decision: "cancel" },
      { subscriptionId: listing.id, decision: "keep" },
    ]);

    const updatedMember = await db.query.members.findFirst({
      where: eq(members.id, member.id),
    });
    expect(updatedMember?.status).toBe("pending_deletion");

    const remainingSessions = await db.query.sessions.findMany({
      where: eq(sessions.memberId, member.id),
    });
    expect(remainingSessions).toHaveLength(0);

    const savedRequest = await db.query.accountDeletionRequests.findFirst({
      where: eq(accountDeletionRequests.memberId, member.id),
    });
    expect(savedRequest?.subscriptionChoices).toEqual([
      { subscriptionId: vip.id, decision: "cancel" },
      { subscriptionId: listing.id, decision: "keep" },
    ]);

    const remainingSubscriptions = await db.query.subscriptions.findMany({
      where: eq(subscriptions.memberId, member.id),
      orderBy: (subscription, { asc }) => [asc(subscription.priceId)],
    });
    expect(
      remainingSubscriptions.map((subscription) => subscription.status),
    ).toEqual(["past_due", "active"]);
  });
});
