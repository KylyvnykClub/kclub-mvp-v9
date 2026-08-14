import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import {
  businessCategories,
  cities,
  companies,
  countries,
  subscriptions,
} from "./schema";

const PUBLISHABLE_LISTING_STATUSES = ["active", "past_due"];

export async function listActiveCategoryBlocks(db: DbClient) {
  const rows = await db.query.businessCategories.findMany({
    where: eq(businessCategories.status, "ACTIVE"),
    columns: { block: true },
  });
  return Array.from(new Set(rows.map((c) => c.block))).sort();
}

export async function listActiveCategoriesByBlock(db: DbClient, block: string) {
  const rows = await db.query.businessCategories.findMany({
    where: and(
      eq(businessCategories.block, block),
      eq(businessCategories.status, "ACTIVE"),
    ),
    columns: { category: true },
  });
  return Array.from(new Set(rows.map((c) => c.category))).sort();
}

export async function listActiveSubcategories(
  db: DbClient,
  block: string,
  category: string,
) {
  return db.query.businessCategories.findMany({
    where: and(
      eq(businessCategories.block, block),
      eq(businessCategories.category, category),
      eq(businessCategories.status, "ACTIVE"),
    ),
    columns: { id: true, subcategory: true },
    orderBy: [asc(businessCategories.subcategory)],
  });
}

export async function listAllCategories(db: DbClient) {
  return db.query.businessCategories.findMany({
    orderBy: [asc(businessCategories.id)],
  });
}

function countValue(row: { value: number } | undefined): number {
  return row?.value ?? 0;
}

export async function createBusinessCategory(
  db: DbClient,
  input: { block: string; category: string; subcategory: string },
) {
  const [nextIdRow] = await db
    .select({
      value: sql<number>`coalesce(max(${businessCategories.id}), 0) + 1`,
    })
    .from(businessCategories);

  const [category] = await db
    .insert(businessCategories)
    .values({
      id: nextIdRow?.value ?? 1,
      block: input.block,
      category: input.category,
      subcategory: input.subcategory,
      status: "ACTIVE",
    })
    .returning();

  return category!;
}

export async function setCategoryStatus(
  db: DbClient,
  categoryId: number,
  status: string,
): Promise<void> {
  await db
    .update(businessCategories)
    .set({ status })
    .where(eq(businessCategories.id, categoryId));
}

export async function deleteBusinessCategory(db: DbClient, categoryId: number) {
  const [usage] = await db
    .select({ value: count() })
    .from(companies)
    .where(eq(companies.businessCategoryId, categoryId));

  if (countValue(usage) > 0) {
    throw new Error("Cannot delete a category that is referenced by companies");
  }

  await db
    .delete(businessCategories)
    .where(eq(businessCategories.id, categoryId));
}

export async function listCountries(db: DbClient) {
  return db.query.countries.findMany({
    orderBy: [asc(countries.name)],
    with: {
      cities: {
        orderBy: [asc(cities.name)],
      },
    },
  });
}

export async function createCountry(
  db: DbClient,
  input: { code: string; name: string },
) {
  const [country] = await db
    .insert(countries)
    .values({
      code: input.code.toUpperCase(),
      name: input.name,
      status: "ACTIVE",
    })
    .returning();

  return country!;
}

export async function setCountryStatus(
  db: DbClient,
  code: string,
  status: string,
) {
  await db
    .update(countries)
    .set({ status })
    .where(eq(countries.code, code.toUpperCase()));
}

export async function deleteCountry(db: DbClient, code: string) {
  const country = await db.query.countries.findFirst({
    where: eq(countries.code, code.toUpperCase()),
  });
  if (!country) return;

  const [companyUsage] = await db
    .select({ value: count() })
    .from(companies)
    .where(
      or(
        eq(companies.country, country.code),
        ilike(companies.country, country.name),
      ),
    );

  if (countValue(companyUsage) > 0) {
    throw new Error("Cannot delete a country that is referenced by companies");
  }

  const [cityUsage] = await db
    .select({ value: count() })
    .from(cities)
    .where(eq(cities.countryCode, country.code));

  if (countValue(cityUsage) > 0) {
    throw new Error("Cannot delete a country that is referenced by cities");
  }

  await db.delete(countries).where(eq(countries.code, country.code));
}

export async function createCity(
  db: DbClient,
  input: { countryCode: string; name: string },
) {
  const [city] = await db
    .insert(cities)
    .values({
      countryCode: input.countryCode.toUpperCase(),
      name: input.name,
      status: "ACTIVE",
    })
    .returning();

  return city!;
}

export async function setCityStatus(
  db: DbClient,
  cityId: number,
  status: string,
) {
  await db.update(cities).set({ status }).where(eq(cities.id, cityId));
}

export async function deleteCity(db: DbClient, cityId: number) {
  const city = await db.query.cities.findFirst({
    where: eq(cities.id, cityId),
    with: {
      country: true,
    },
  });
  if (!city) return;

  const [companyUsage] = await db
    .select({ value: count() })
    .from(companies)
    .where(
      and(
        ilike(companies.city, city.name),
        city.country
          ? or(
              eq(companies.country, city.country.code),
              ilike(companies.country, city.country.name),
            )
          : undefined,
      ),
    );

  if (countValue(companyUsage) > 0) {
    throw new Error("Cannot delete a city that is referenced by companies");
  }

  await db.delete(cities).where(eq(cities.id, cityId));
}

export async function validateCityBelongsToCountry(
  db: DbClient,
  cityName: string,
  countryInput: string,
): Promise<boolean> {
  const city = await db.query.cities.findFirst({
    where: and(ilike(cities.name, cityName), eq(cities.status, "ACTIVE")),
    with: { country: true },
  });

  if (!city) return true;

  const countryUpper = countryInput.toUpperCase();
  return (
    city.countryCode.toUpperCase() === countryUpper ||
    (city.country?.name ?? "").toUpperCase() === countryUpper
  );
}

export async function findCategoryById(db: DbClient, categoryId: number) {
  return db.query.businessCategories.findFirst({
    where: eq(businessCategories.id, categoryId),
  });
}

export async function companySlugExists(
  db: DbClient,
  slug: string,
): Promise<boolean> {
  const existing = await db.query.companies.findFirst({
    where: eq(companies.slug, slug),
  });
  return existing !== undefined;
}

export async function insertCompany(
  db: DbClient,
  values: typeof companies.$inferInsert,
): Promise<void> {
  await db.insert(companies).values(values);
}

export async function listCompanyIdsWithActiveSubscription(
  db: DbClient,
): Promise<string[]> {
  const rows = await db
    .select({ companyId: subscriptions.companyId })
    .from(subscriptions)
    .where(inArray(subscriptions.status, PUBLISHABLE_LISTING_STATUSES));

  return rows.map((s) => s.companyId).filter((id): id is string => id !== null);
}

export interface PartnerFilters {
  categoryId?: number;
  block?: string;
  query?: string;
  country?: string;
  city?: string;
}

export async function listApprovedCompaniesByIds(
  db: DbClient,
  ids: string[],
  filters?: PartnerFilters,
) {
  let conditions = and(
    eq(companies.moderationStatus, "approved"),
    inArray(companies.id, ids),
  );

  if (filters?.categoryId) {
    conditions = and(
      conditions,
      eq(companies.businessCategoryId, filters.categoryId),
    );
  } else if (filters?.block) {
    const catIds = await db
      .select({ id: businessCategories.id })
      .from(businessCategories)
      .where(eq(businessCategories.block, filters.block));
    const ids2 = catIds.map((c) => c.id);
    if (ids2.length > 0) {
      conditions = and(conditions, inArray(companies.businessCategoryId, ids2));
    } else {
      return [];
    }
  }

  if (filters?.country) {
    conditions = and(conditions, ilike(companies.country, filters.country));
  }

  if (filters?.city) {
    conditions = and(conditions, ilike(companies.city, filters.city));
  }

  if (filters?.query) {
    conditions = and(
      conditions,
      or(
        ilike(companies.name, `%${filters.query}%`),
        ilike(companies.description, `%${filters.query}%`),
      ),
    );
  }

  return db.query.companies.findMany({
    where: conditions,
    with: {
      businessCategory: true,
    },
    orderBy: [asc(companies.name)],
  });
}

export type PartnerCompanyView = Awaited<
  ReturnType<typeof listApprovedCompaniesByIds>
>[number];

export async function listShowcaseCompanies(
  db: DbClient,
  ids: string[],
  type: "top" | "featured",
  limit = 3,
) {
  return db.query.companies.findMany({
    where: and(
      eq(companies.moderationStatus, "approved"),
      inArray(companies.id, ids),
      eq(companies.showcaseType, type),
    ),
    with: {
      businessCategory: true,
    },
    limit,
    orderBy: [asc(companies.showcaseRank), asc(companies.name)],
  });
}

export async function findApprovedCompanyBySlug(
  db: DbClient,
  slug: string,
  ids: string[],
) {
  return db.query.companies.findFirst({
    where: and(
      eq(companies.slug, slug),
      eq(companies.moderationStatus, "approved"),
      inArray(companies.id, ids),
    ),
    with: {
      businessCategory: true,
      owner: {
        columns: {
          id: true,
          displayName: true,
        },
      },
    },
  });
}

export type PartnerDetailView = Awaited<
  ReturnType<typeof findApprovedCompanyBySlug>
>;

export async function listPendingCompanies(db: DbClient) {
  return db.query.companies.findMany({
    where: eq(companies.moderationStatus, "pending"),
    with: {
      businessCategory: true,
      owner: {
        columns: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: [asc(companies.name)],
  });
}

export async function setCompanyModerationStatus(
  db: DbClient,
  companyId: string,
  status: "approved" | "rejected",
  reason: string | null,
): Promise<void> {
  await db
    .update(companies)
    .set({
      moderationStatus: status,
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}

export async function setCompanyShowcase(
  db: DbClient,
  companyId: string,
  showcaseType: "none" | "top" | "featured",
  showcaseRank: number,
): Promise<void> {
  await db
    .update(companies)
    .set({ showcaseType, showcaseRank, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

export interface PendingChanges {
  name?: string;
  businessCategoryId?: number;
  description?: string;
  discount?: string;
}

export async function setCompanyPendingChanges(
  db: DbClient,
  companyId: string,
  changes: PendingChanges,
): Promise<void> {
  await db
    .update(companies)
    .set({ pendingChanges: changes, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

export async function applyCompanyPendingChanges(
  db: DbClient,
  companyId: string,
): Promise<void> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company?.pendingChanges) return;

  const changes = company.pendingChanges as PendingChanges;
  const updates: Record<string, unknown> = {
    pendingChanges: null,
    updatedAt: new Date(),
  };

  if (changes.name !== undefined) updates.name = changes.name;
  if (changes.businessCategoryId !== undefined)
    updates.businessCategoryId = changes.businessCategoryId;
  if (changes.description !== undefined)
    updates.description = changes.description;
  if (changes.discount !== undefined) updates.discount = changes.discount;

  await db.update(companies).set(updates).where(eq(companies.id, companyId));
}

export async function clearCompanyPendingChanges(
  db: DbClient,
  companyId: string,
): Promise<void> {
  await db
    .update(companies)
    .set({ pendingChanges: null, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

export async function listCompaniesWithPendingChanges(db: DbClient) {
  return db.query.companies.findMany({
    where: and(
      eq(companies.moderationStatus, "approved"),
      sql`${companies.pendingChanges} IS NOT NULL`,
    ),
    with: {
      businessCategory: true,
      owner: {
        columns: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: [asc(companies.updatedAt)],
  });
}

export async function findCompanyById(db: DbClient, companyId: string) {
  return db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
}

export async function updateCompanyFields(
  db: DbClient,
  companyId: string,
  fields: Partial<{
    name: string;
    description: string | null;
    discount: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    country: string | null;
    city: string | null;
  }>,
): Promise<void> {
  await db
    .update(companies)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

export async function listCompaniesByOwner(db: DbClient, ownerId: string) {
  return db.query.companies.findMany({
    where: eq(companies.ownerId, ownerId),
  });
}

export type CompanyRow = Awaited<
  ReturnType<typeof listCompaniesByOwner>
>[number];

export async function findApprovedCompanyByOwner(
  db: DbClient,
  companyId: string,
  ownerId: string,
) {
  return db.query.companies.findFirst({
    where: and(
      eq(companies.id, companyId),
      eq(companies.ownerId, ownerId),
      eq(companies.moderationStatus, "approved"),
    ),
  });
}

export async function listApprovedCompaniesWithSubscriptionsByOwner(
  db: DbClient,
  ownerId: string,
) {
  return db.query.companies.findMany({
    where: and(
      eq(companies.ownerId, ownerId),
      eq(companies.moderationStatus, "approved"),
    ),
    with: {
      subscriptions: true,
    },
  });
}
