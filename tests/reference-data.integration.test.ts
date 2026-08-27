import { describe, expect, it } from "vitest";
import type { DbClient } from "@/data/db.js";
import {
  createBusinessCategory,
  createCity,
  createCountry,
  deleteBusinessCategory,
  deleteCity,
  deleteCountry,
} from "@/data/companies.js";
import {
  businessCategories,
  companies,
  companyCategories,
  members,
} from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedOwner(db: DbClient) {
  const [owner] = await db
    .insert(members)
    .values({
      phone: `+15558${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Reference Owner",
      country: "US",
      language: "en",
      role: "partner_owner",
      status: "active",
    })
    .returning();

  return owner!;
}

async function seedCompany(
  db: DbClient,
  input: { categoryId: number; country?: string; city?: string },
) {
  const owner = await seedOwner(db);

  const [company] = await db
    .insert(companies)
    .values({
      ownerId: owner.id,
      businessCategoryId: input.categoryId,
      name: `Reference Company ${crypto.randomUUID()}`,
      slug: `reference-company-${crypto.randomUUID()}`,
      country: input.country ?? "US",
      city: input.city ?? "New York",
      moderationStatus: "approved",
    })
    .returning();

  // The category lives in the join table now - companies.business_category_id
  // is the deprecated column, and deleteBusinessCategory counts join rows.
  await db
    .insert(companyCategories)
    .values({ companyId: company!.id, businessCategoryId: input.categoryId });

  return company!;
}

describe("reference data management (FR-085)", () => {
  it("creates and deletes an unreferenced business category", async () => {
    const db = testDbClient();
    const category = await createBusinessCategory(db, {
      block: "Wellness",
      category: "Fitness",
      subcategory: "Pilates",
    });

    await deleteBusinessCategory(db, category.id);

    const found = await db.query.businessCategories.findFirst({
      where: (table, { eq }) => eq(table.id, category.id),
    });
    expect(found).toBeUndefined();
  });

  it("blocks deletion of a business category referenced by a company", async () => {
    const db = testDbClient();
    const [category] = await db
      .insert(businessCategories)
      .values({
        id: 900001,
        block: "Food",
        category: "Restaurants",
        subcategory: "Fine dining",
        status: "ACTIVE",
      })
      .returning();

    await seedCompany(db, { categoryId: category!.id });

    await expect(deleteBusinessCategory(db, category!.id)).rejects.toThrow(
      /referenced by companies/,
    );
  });

  it("manages countries and prevents deleting countries with cities or companies", async () => {
    const db = testDbClient();
    const country = await createCountry(db, {
      code: "CA",
      name: "Canada",
    });

    await createCity(db, { countryCode: country.code, name: "Toronto" });

    await expect(deleteCountry(db, country.code)).rejects.toThrow(
      /referenced by cities/,
    );

    const companyCountry = await createCountry(db, {
      code: "MX",
      name: "Mexico",
    });
    const category = await createBusinessCategory(db, {
      block: "Travel",
      category: "Hotels",
      subcategory: "Boutique",
    });
    await seedCompany(db, {
      categoryId: category.id,
      country: companyCountry.name,
      city: "Mexico City",
    });

    await expect(deleteCountry(db, companyCountry.code)).rejects.toThrow(
      /referenced by companies/,
    );
  });

  it("creates and deletes cities unless they are referenced by companies", async () => {
    const db = testDbClient();
    const country = await createCountry(db, {
      code: "BR",
      name: "Brazil",
    });
    const deletableCity = await createCity(db, {
      countryCode: country.code,
      name: "Rio de Janeiro",
    });

    await deleteCity(db, deletableCity.id);

    const deleted = await db.query.cities.findFirst({
      where: (table, { eq }) => eq(table.id, deletableCity.id),
    });
    expect(deleted).toBeUndefined();

    const referencedCity = await createCity(db, {
      countryCode: country.code,
      name: "Sao Paulo",
    });
    const category = await createBusinessCategory(db, {
      block: "Services",
      category: "Consulting",
      subcategory: "Business",
    });
    await seedCompany(db, {
      categoryId: category.id,
      country: country.name,
      city: referencedCity.name,
    });

    await expect(deleteCity(db, referencedCity.id)).rejects.toThrow(
      /referenced by companies/,
    );
  });
});
