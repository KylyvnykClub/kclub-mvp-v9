import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";

import type { DbClient } from "./db";
import { businessCategories, companies, subscriptions } from "./schema";

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
    .where(eq(subscriptions.status, "active"));

  return rows.map((s) => s.companyId).filter((id): id is string => id !== null);
}

export interface PartnerFilters {
  categoryId?: number;
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
  limit: number,
) {
  return db.query.companies.findMany({
    where: and(
      eq(companies.moderationStatus, "approved"),
      inArray(companies.id, ids),
    ),
    with: {
      businessCategory: true,
    },
    limit,
    orderBy: [asc(companies.name)],
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
