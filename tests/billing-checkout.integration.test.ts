import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import { findCompanyByOwner } from "@/data/companies.js";
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

async function seedCompany(
  db: DbClient,
  ownerId: string,
  categoryId: number,
  moderationStatus: "pending" | "approved" | "rejected",
) {
  const [company] = await db
    .insert(companies)
    .values({
      ownerId,
      businessCategoryId: categoryId,
      name: `${moderationStatus} listing`,
      slug: `${moderationStatus}-${crypto.randomUUID()}`,
      moderationStatus,
    })
    .returning();

  return company!;
}

describe("FR-100: listing checkout is gated by ownership, not by moderation", () => {
  it("FR-100: resolves a pending company for its owner, so payment precedes moderation (ADR 0019)", async () => {
    const db = testDbClient();
    const owner = await seedMember(db, "1000001");
    const categoryId = await seedCategory(db);
    const pending = await seedCompany(db, owner.id, categoryId, "pending");

    await expect(
      findCompanyByOwner(db, pending.id, owner.id),
    ).resolves.toMatchObject({
      id: pending.id,
      moderationStatus: "pending",
    });
  });

  it("FR-100: resolves an approved company too, so paying later from the profile still works", async () => {
    const db = testDbClient();
    const owner = await seedMember(db, "1000003");
    const categoryId = await seedCategory(db);
    const approved = await seedCompany(db, owner.id, categoryId, "approved");

    await expect(
      findCompanyByOwner(db, approved.id, owner.id),
    ).resolves.toMatchObject({ id: approved.id });
  });

  it("FR-100: does not resolve a company owned by someone else", async () => {
    const db = testDbClient();
    const owner = await seedMember(db, "1000004");
    const other = await seedMember(db, "1000005");
    const categoryId = await seedCategory(db);
    const company = await seedCompany(db, owner.id, categoryId, "pending");

    await expect(
      findCompanyByOwner(db, company.id, other.id),
    ).resolves.toBeUndefined();
  });

  it("FR-100: does not resolve a company id that does not exist", async () => {
    const db = testDbClient();
    const owner = await seedMember(db, "1000006");

    await expect(
      findCompanyByOwner(db, crypto.randomUUID(), owner.id),
    ).resolves.toBeUndefined();
  });

  /**
   * The rejected case is refused in `createCheckoutSessionAction` rather than
   * in the query, because the query is also what the result pages use to name
   * the company. This proves the row is still readable, so the guard has
   * something to refuse - see the action's own status check.
   */
  it("FR-100: still returns a rejected company, which the action refuses separately", async () => {
    const db = testDbClient();
    const owner = await seedMember(db, "1000007");
    const categoryId = await seedCategory(db);
    const rejected = await seedCompany(db, owner.id, categoryId, "rejected");

    await expect(
      findCompanyByOwner(db, rejected.id, owner.id),
    ).resolves.toMatchObject({ moderationStatus: "rejected" });
  });
});
