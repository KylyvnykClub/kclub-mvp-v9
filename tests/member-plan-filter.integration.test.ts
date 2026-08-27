import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import { memberPlansOf } from "@/data/billing-access.js";
import {
  MEMBER_ADMIN_PLANS,
  countMembersByPlan,
  searchMembers,
} from "@/data/members.js";
import {
  businessCategories,
  companies,
  members,
  subscriptions,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-083: the plan a member holds, as a column staff can filter on.
 *
 * The rule exists twice - once as `memberPlansOf`, which renders the badge, and
 * once as SQL in `memberAdminWhere`, which filters the list. Two expressions of
 * one rule drift, so the last test here pins them to each other: whatever the
 * badge says about a member, the matching chip must return that member.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient, displayName: string) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+1555${crypto.randomUUID().slice(0, 7)}`,
      passwordHash: "hash",
      displayName,
      country: "US",
      language: "en",
      role: "member",
    })
    .returning();

  return member!;
}

async function seedCompany(db: DbClient, ownerId: string) {
  const categoryId = Math.floor(100_000 + Math.random() * 800_000);
  await db.insert(businessCategories).values({
    id: categoryId,
    block: "Services",
    category: "Plan",
    subcategory: `Plan ${categoryId}`,
  });

  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      businessCategoryId: categoryId,
      name: "Plan Company",
      slug: `plan-${crypto.randomUUID()}`,
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
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

/** A fresh table per test, so the counts below are exact rather than relative. */
async function clearMembers(db: DbClient) {
  await db.delete(subscriptions);
  await db.delete(companies);
  await db.delete(members);
}

async function idsMatching(
  db: DbClient,
  plan: (typeof MEMBER_ADMIN_PLANS)[number],
) {
  const rows = await searchMembers(db, { plan }, { limit: 50, offset: 0 });
  return rows.map((row) => row.id).sort();
}

describe("FR-083: filtering the member list by plan", () => {
  it("returns only members holding a membership subscription for vip", async () => {
    const db = testDbClient();
    await clearMembers(db);

    const vip = await seedMember(db, "Vip Member");
    await seedSubscription(db, { memberId: vip.id, status: "active" });
    const free = await seedMember(db, "Free Member");

    expect(await idsMatching(db, "vip")).toEqual([vip.id]);
    expect(await idsMatching(db, "free")).toEqual([free.id]);
  });

  it("returns only members holding a company listing for business", async () => {
    const db = testDbClient();
    await clearMembers(db);

    const owner = await seedMember(db, "Owner");
    const company = await seedCompany(db, owner.id);
    await seedSubscription(db, {
      memberId: owner.id,
      companyId: company.id,
      status: "active",
    });

    expect(await idsMatching(db, "business")).toEqual([owner.id]);
    expect(await idsMatching(db, "vip")).toEqual([]);
  });

  it("FR-056: a past_due member is still on their plan, not free", async () => {
    const db = testDbClient();
    await clearMembers(db);

    const dunning = await seedMember(db, "Dunning Member");
    await seedSubscription(db, { memberId: dunning.id, status: "past_due" });

    expect(await idsMatching(db, "vip")).toEqual([dunning.id]);
    expect(await idsMatching(db, "free")).toEqual([]);
  });

  it("counts a member holding both under both chips", async () => {
    const db = testDbClient();
    await clearMembers(db);

    const both = await seedMember(db, "Both Member");
    const company = await seedCompany(db, both.id);
    await seedSubscription(db, { memberId: both.id, status: "active" });
    await seedSubscription(db, {
      memberId: both.id,
      companyId: company.id,
      status: "active",
    });

    const counts = await countMembersByPlan(db);

    expect(counts.vip).toBe(1);
    expect(counts.business).toBe(1);
    expect(counts.free).toBe(0);
  });

  it("treats a lapsed subscription as free", async () => {
    const db = testDbClient();
    await clearMembers(db);

    const lapsed = await seedMember(db, "Lapsed Member");
    await seedSubscription(db, { memberId: lapsed.id, status: "canceled" });

    expect(await idsMatching(db, "free")).toEqual([lapsed.id]);
    expect(await idsMatching(db, "vip")).toEqual([]);
  });

  it("the filter and the rendered badge agree about every member", async () => {
    const db = testDbClient();
    await clearMembers(db);

    // One member per interesting shape, seeded together so a single pass over
    // the list can be checked against a single pass of the filter.
    const free = await seedMember(db, "Agree Free");
    const vip = await seedMember(db, "Agree Vip");
    await seedSubscription(db, { memberId: vip.id, status: "active" });
    const dunning = await seedMember(db, "Agree Dunning");
    await seedSubscription(db, { memberId: dunning.id, status: "past_due" });
    const owner = await seedMember(db, "Agree Owner");
    const company = await seedCompany(db, owner.id);
    await seedSubscription(db, {
      memberId: owner.id,
      companyId: company.id,
      status: "active",
    });
    const both = await seedMember(db, "Agree Both");
    const bothCompany = await seedCompany(db, both.id);
    await seedSubscription(db, { memberId: both.id, status: "active" });
    await seedSubscription(db, {
      memberId: both.id,
      companyId: bothCompany.id,
      status: "active",
    });

    const everyone = await searchMembers(db, {}, { limit: 50, offset: 0 });
    expect(everyone).toHaveLength(5);

    for (const plan of MEMBER_ADMIN_PLANS) {
      const badgeSays = everyone
        .filter((member) => memberPlansOf(member.subscriptions).includes(plan))
        .map((member) => member.id)
        .sort();

      expect(await idsMatching(db, plan)).toEqual(badgeSays);
    }

    // And the seeding was what the test thinks it was.
    expect(
      everyone.find((member) => member.id === free.id)?.subscriptions,
    ).toHaveLength(0);
  });
});
