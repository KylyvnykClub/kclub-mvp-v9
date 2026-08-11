import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import { findApprovedCompanyByOwner } from "@/data/companies.js";
import { businessCategories, companies, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient, phoneSuffix: string) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+1555${phoneSuffix}`,
      passwordHash: "hash",
      displayName: `Member ${phoneSuffix}`,
      country: "US",
      language: "en",
    })
    .returning();

  return member!;
}

async function seedCategory(db: DbClient) {
  const id = Math.floor(100_000 + Math.random() * 900_000);
  await db.insert(businessCategories).values({
    id,
    block: "Services",
    category: "Consulting",
    subcategory: `Checkout ${id}`,
  });
  return id;
}

describe("billing checkout ownership guard", () => {
  it("allows listing checkout only for the approved company owner", async () => {
    const db = testDbClient();
    const owner = await seedMember(db, "1000001");
    const other = await seedMember(db, "1000002");
    const categoryId = await seedCategory(db);

    const [approvedCompany] = await db
      .insert(companies)
      .values({
        ownerId: owner.id,
        businessCategoryId: categoryId,
        name: "Approved Listing",
        slug: `approved-${crypto.randomUUID()}`,
        moderationStatus: "approved",
      })
      .returning();

    const [pendingCompany] = await db
      .insert(companies)
      .values({
        ownerId: owner.id,
        businessCategoryId: categoryId,
        name: "Pending Listing",
        slug: `pending-${crypto.randomUUID()}`,
        moderationStatus: "pending",
      })
      .returning();

    await expect(
      findApprovedCompanyByOwner(db, approvedCompany!.id, owner.id),
    ).resolves.toMatchObject({ id: approvedCompany!.id });
    await expect(
      findApprovedCompanyByOwner(db, approvedCompany!.id, other.id),
    ).resolves.toBeUndefined();
    await expect(
      findApprovedCompanyByOwner(db, pendingCompany!.id, owner.id),
    ).resolves.toBeUndefined();
  });
});
