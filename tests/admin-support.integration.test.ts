import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import { getAdminSupportMetrics } from "@/data/admin.js";
import {
  businessCategories,
  companies,
  members,
  referrals,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(
  db: DbClient,
  input: {
    phoneSuffix: string;
    role?: "member" | "member_vip" | "partner_owner" | "staff_support";
    status?: "active" | "blocked" | "pending_deletion";
    createdAt?: Date;
  },
) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15557${input.phoneSuffix}`,
      passwordHash: "hash",
      displayName: `Support metric ${input.phoneSuffix}`,
      country: "US",
      language: "en",
      role: input.role ?? "member",
      status: input.status ?? "active",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .returning();

  return member!;
}

async function seedCategory(db: DbClient) {
  const id = Math.floor(100_000 + Math.random() * 900_000);
  await db.insert(businessCategories).values({
    id,
    block: "Services",
    category: "Support",
    subcategory: `Dashboard ${id}`,
  });
  return id;
}

describe("admin support dashboard metrics (FR-081)", () => {
  it("counts club members and moderation queues without counting staff as members", async () => {
    const db = testDbClient();
    const before = await getAdminSupportMetrics(db);
    const categoryId = await seedCategory(db);
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const activeMember = await seedMember(db, { phoneSuffix: "100001" });
    await seedMember(db, {
      phoneSuffix: "100002",
      role: "member_vip",
      status: "blocked",
      createdAt: oldDate,
    });
    await seedMember(db, {
      phoneSuffix: "100003",
      role: "staff_support",
    });

    const [pendingCompany] = await db
      .insert(companies)
      .values({
        ownerId: activeMember.id,
        businessCategoryId: categoryId,
        name: "Pending Support Company",
        slug: `pending-support-${crypto.randomUUID()}`,
        moderationStatus: "pending",
      })
      .returning();

    await db.insert(companies).values({
      ownerId: activeMember.id,
      businessCategoryId: categoryId,
      name: "Approved Support Company",
      slug: `approved-support-${crypto.randomUUID()}`,
      moderationStatus: "approved",
    });

    await db.insert(referrals).values({
      senderId: activeMember.id,
      recipientCompanyId: pendingCompany!.id,
      clientName: "Client Pending",
      serviceNeeded: "Review",
      status: "pending_review",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await db.insert(referrals).values({
      senderId: activeMember.id,
      recipientCompanyId: pendingCompany!.id,
      clientName: "Client Delivered",
      serviceNeeded: "Review",
      status: "delivered",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await expect(getAdminSupportMetrics(db)).resolves.toEqual({
      totalMembers: before.totalMembers + 2,
      activeMembers: before.activeMembers + 1,
      newMembers: before.newMembers + 1,
      pendingCompanies: before.pendingCompanies + 1,
      pendingReferrals: before.pendingReferrals + 1,
    });
  });
});
