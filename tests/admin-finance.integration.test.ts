import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import { getAdminDashboardMetrics } from "@/data/admin.js";
import {
  businessCategories,
  companies,
  members,
  subscriptions,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15558${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Finance Member",
      country: "US",
      language: "en",
    })
    .returning();

  return member!;
}

async function seedCompany(db: DbClient, ownerId: string) {
  const id = Math.floor(100_000 + Math.random() * 900_000);
  await db.insert(businessCategories).values({
    id,
    block: "Services",
    category: "Finance",
    subcategory: `Dashboard ${id}`,
  });

  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      businessCategoryId: id,
      name: "Finance Company",
      slug: `finance-${crypto.randomUUID()}`,
      moderationStatus: "approved",
    })
    .returning();

  return company!;
}

async function seedSubscription(
  db: DbClient,
  input: { memberId: string; companyId?: string | null; status: string },
) {
  await db.insert(subscriptions).values({
    memberId: input.memberId,
    companyId: input.companyId ?? null,
    stripeCustomerId: `cus_${crypto.randomUUID()}`,
    stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
    status: input.status,
    priceId: `price_${crypto.randomUUID()}`,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });
}

describe("admin finance dashboard metrics (FR-082)", () => {
  it("splits active subscriptions by type and counts renewals due within 7 days", async () => {
    const db = testDbClient();
    const before = await getAdminDashboardMetrics(db);
    const member = await seedMember(db);
    const company = await seedCompany(db, member.id);

    await seedSubscription(db, { memberId: member.id, status: "active" });
    await seedSubscription(db, {
      memberId: member.id,
      companyId: company.id,
      status: "active",
    });
    await seedSubscription(db, {
      memberId: member.id,
      companyId: company.id,
      status: "canceled",
    });

    await expect(getAdminDashboardMetrics(db)).resolves.toEqual({
      activeVip: before.activeVip + 1,
      activeCompany: before.activeCompany + 1,
      renewalsDue: before.renewalsDue + 2,
    });
  });
});
