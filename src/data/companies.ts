import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DbClient } from "./db";
import { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "./billing-access";
import type { PageParams } from "./pagination";
import {
  businessCategories,
  businessCategoryTranslations,
  companyCategories,
  companyServiceCountries,
  cities,
  companies,
  countries,
  subscriptions,
} from "./schema";

/**
 * A listing is publishable exactly while its subscription grants access. This is
 * the same rule the entitlement projection uses, imported rather than copied:
 * money and access must never disagree (ADR 0004), and since ADR 0019 payment
 * precedes moderation, two drifting copies would decide publication differently.
 */
const PUBLISHABLE_LISTING_STATUSES = ACCESS_GRANTING_SUBSCRIPTION_STATUSES;

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
    .from(companyCategories)
    .where(eq(companyCategories.businessCategoryId, categoryId));

  if (countValue(usage) > 0) {
    throw new Error("Cannot delete a category that is referenced by companies");
  }

  await db
    .delete(businessCategories)
    .where(eq(businessCategories.id, categoryId));
}

/**
 * Every active category triple, for a filter that has to cascade in the browser.
 *
 * One query rather than the three round-trips listActiveCategoryBlocks /
 * ByBlock / listActiveSubcategories would cost: the caller groups these in
 * memory, and the table is reference data measured in hundreds of rows.
 */
export async function listActiveCategoryTree(db: DbClient) {
  return db.query.businessCategories.findMany({
    where: eq(businessCategories.status, "ACTIVE"),
    columns: { id: true, block: true, category: true, subcategory: true },
    orderBy: [
      asc(businessCategories.block),
      asc(businessCategories.category),
      asc(businessCategories.subcategory),
    ],
  });
}

export async function listLocalizedCategoryTree(
  db: DbClient,
  locale: "en" | "ru" | "uk",
) {
  return db
    .select({
      id: businessCategories.id,
      block: sql<string>`coalesce(${businessCategoryTranslations.block}, ${businessCategories.block})`,
      category: sql<string>`coalesce(${businessCategoryTranslations.category}, ${businessCategories.category})`,
      subcategory: sql<string>`coalesce(${businessCategoryTranslations.subcategory}, ${businessCategories.subcategory})`,
    })
    .from(businessCategories)
    .leftJoin(
      businessCategoryTranslations,
      and(
        eq(
          businessCategoryTranslations.businessCategoryId,
          businessCategories.id,
        ),
        eq(businessCategoryTranslations.locale, locale),
      ),
    )
    .where(eq(businessCategories.status, "ACTIVE"))
    .orderBy(
      asc(
        sql`coalesce(${businessCategoryTranslations.block}, ${businessCategories.block})`,
      ),
      asc(
        sql`coalesce(${businessCategoryTranslations.category}, ${businessCategories.category})`,
      ),
      asc(
        sql`coalesce(${businessCategoryTranslations.subcategory}, ${businessCategories.subcategory})`,
      ),
    );
}

export type CategoryTreeRow = Awaited<
  ReturnType<typeof listLocalizedCategoryTree>
>[number];

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

/** Returns the new company's id, which the caller needs to open checkout (ADR 0019). */
export async function insertCompany(
  db: DbClient,
  values: typeof companies.$inferInsert,
  serviceCountryCodes: string[] = [],
  categoryIds: number[] = [],
): Promise<string> {
  return db.transaction(async (tx) => {
    const [company] = await tx.insert(companies).values(values).returning({
      id: companies.id,
    });
    if (categoryIds.length > 0) {
      await tx.insert(companyCategories).values(
        [...new Set(categoryIds)].map((businessCategoryId) => ({
          companyId: company!.id,
          businessCategoryId,
        })),
      );
    }
    if (serviceCountryCodes.length > 0) {
      await tx.insert(companyServiceCountries).values(
        [...new Set(serviceCountryCodes)].map((countryCode) => ({
          companyId: company!.id,
          countryCode,
        })),
      );
    }
    return company!.id;
  });
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
  /** A single business_categories row, i.e. a chosen subcategory. */
  categoryId?: number;
  block?: string;
  /** Middle level of the category triple; only meaningful with a block. */
  category?: string;
  query?: string;
  country?: string;
  city?: string;
  serviceCountryCode?: string;
  businessMode?: "online" | "offline";
  administrativeLevel1?: string;
  administrativeLevel2?: string;
}

/**
 * The catalogue's filter set, shared by the listing and its count so the two
 * can never disagree about what "matching" means.
 *
 * Returns null when a filter rules out every row before the query runs - the
 * block branch can discover there is no such category at all.
 */
async function approvedCompanyConditions(
  db: DbClient,
  ids: string[],
  filters?: PartnerFilters,
) {
  let conditions = and(
    eq(companies.moderationStatus, "approved"),
    inArray(companies.id, ids),
  );

  if (filters?.categoryId) {
    const matchingCompanies = await db
      .select({ companyId: companyCategories.companyId })
      .from(companyCategories)
      .where(eq(companyCategories.businessCategoryId, filters.categoryId));
    const matchIds = matchingCompanies.map((r) => r.companyId);
    if (matchIds.length === 0) return null;
    conditions = and(conditions, inArray(companies.id, matchIds));
  } else if (filters?.block) {
    const where = filters.category
      ? and(
          eq(businessCategories.block, filters.block),
          eq(businessCategories.category, filters.category),
        )
      : eq(businessCategories.block, filters.block);

    const catIds = await db
      .select({ id: businessCategories.id })
      .from(businessCategories)
      .where(where);
    const catIdValues = catIds.map((c) => c.id);
    if (catIdValues.length === 0) return null;
    const matchingCompanies = await db
      .select({ companyId: companyCategories.companyId })
      .from(companyCategories)
      .where(inArray(companyCategories.businessCategoryId, catIdValues));
    const matchIds = [...new Set(matchingCompanies.map((r) => r.companyId))];
    if (matchIds.length === 0) return null;
    conditions = and(conditions, inArray(companies.id, matchIds));
  }

  if (filters?.serviceCountryCode) {
    const serviceCompanies = await db
      .select({ companyId: companyServiceCountries.companyId })
      .from(companyServiceCountries)
      .where(
        eq(
          companyServiceCountries.countryCode,
          filters.serviceCountryCode.toUpperCase(),
        ),
      );
    conditions = and(
      conditions,
      or(
        eq(companies.servesWorldwide, 1),
        inArray(
          companies.id,
          serviceCompanies.map((row) => row.companyId),
        ),
      ),
    );
  } else if (filters?.country) {
    conditions = and(conditions, ilike(companies.country, filters.country));
  }

  if (filters?.businessMode === "online") {
    conditions = and(
      conditions,
      inArray(companies.businessFormat, ["online_only", "online_offline"]),
    );
  }
  if (filters?.businessMode === "offline") {
    conditions = and(
      conditions,
      inArray(companies.businessFormat, [
        "offline_only",
        "online_offline",
        "on_site_service",
      ]),
      filters.serviceCountryCode
        ? eq(
            companies.registrationCountryCode,
            filters.serviceCountryCode.toUpperCase(),
          )
        : undefined,
    );
  }

  if (filters?.administrativeLevel1) {
    conditions = and(
      conditions,
      ilike(companies.administrativeLevel1, filters.administrativeLevel1),
    );
  }
  if (filters?.administrativeLevel2) {
    conditions = and(
      conditions,
      ilike(companies.administrativeLevel2, filters.administrativeLevel2),
    );
  }

  if (filters?.city) {
    conditions = and(conditions, ilike(companies.city, filters.city));
  }

  if (filters?.query) {
    const q = filters.query;
    // FR-032 / ADR 0006: search_vector is a trigger-maintained tsvector, not
    // part of the Drizzle schema (see db/migrations/20260817090000). "simple"
    // has no stemming, so en/ru/uk are matched the same way rather than
    // Ukrainian alone being weaker. similarity() falls back for near-misses
    // (typos, prefixes) that don't share a whole lexeme with the query.
    conditions = and(
      conditions,
      or(
        sql`"companies"."search_vector" @@ websearch_to_tsquery('simple', ${q})`,
        sql`similarity(lower("companies"."name"), lower(${q})) > 0.2`,
      ),
    );
  }

  return conditions;
}

export async function listApprovedCompaniesByIds(
  db: DbClient,
  ids: string[],
  filters?: PartnerFilters,
  page?: PageParams,
) {
  const conditions = await approvedCompanyConditions(db, ids, filters);
  if (conditions === null) return [];

  const orderBy = filters?.query
    ? [
        desc(sql`
          ts_rank("companies"."search_vector", websearch_to_tsquery('simple', ${filters.query}))
          + similarity(lower("companies"."name"), lower(${filters.query})) * 0.3
        `),
      ]
    : [asc(companies.name)];

  // Unpaged when no page is asked for, because every existing caller - the
  // tests and the billing checks - reads the whole set.
  return db.query.companies.findMany({
    where: conditions,
    with: {
      categories: { with: { businessCategory: true } },
      serviceCountries: true,
    },
    orderBy,
    ...(page ? { limit: page.limit, offset: page.offset } : {}),
  });
}

/**
 * How many partners the same filters match, for the catalogue's paging.
 */
/**
 * The country/city pairs that actually occur among visible partners.
 *
 * Built from the companies rather than the countries/cities reference tables on
 * purpose. The reference tables hold ISO codes and, today, no cities at all,
 * while `companies.country` stores a display name - so a filter offering codes
 * would match nothing, and a city select would be empty. Deriving the options
 * from the data guarantees every one of them returns at least one partner.
 */
export async function listPartnerLocations(db: DbClient, ids: string[]) {
  if (ids.length === 0) return [];

  const rows = await db
    .selectDistinct({ country: companies.country, city: companies.city })
    .from(companies)
    .where(
      and(
        eq(companies.moderationStatus, "approved"),
        inArray(companies.id, ids),
      ),
    )
    .orderBy(asc(companies.country), asc(companies.city));

  return rows.filter((r): r is { country: string; city: string | null } =>
    Boolean(r.country),
  );
}

export type PartnerLocation = Awaited<
  ReturnType<typeof listPartnerLocations>
>[number];

export async function countApprovedCompaniesByIds(
  db: DbClient,
  ids: string[],
  filters?: PartnerFilters,
): Promise<number> {
  const conditions = await approvedCompanyConditions(db, ids, filters);
  if (conditions === null) return 0;

  const [row] = await db
    .select({ value: count() })
    .from(companies)
    .where(conditions);

  return row?.value ?? 0;
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
      categories: { with: { businessCategory: true } },
      serviceCountries: true,
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
      categories: { with: { businessCategory: true } },
      serviceCountries: true,
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

/**
 * Slugs of the publicly listable partners - approved and among the set with an
 * active subscription. Used by the sitemap; returns only the slug so it stays a
 * cheap query even as the catalogue grows.
 */
export async function listPublicPartnerSlugs(
  db: DbClient,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db.query.companies.findMany({
    where: and(
      eq(companies.moderationStatus, "approved"),
      inArray(companies.id, ids),
    ),
    columns: { slug: true },
  });
  return rows.map((r) => r.slug);
}

export async function listPendingCompanies(db: DbClient) {
  return db.query.companies.findMany({
    where: eq(companies.moderationStatus, "pending"),
    with: {
      categories: { with: { businessCategory: true } },
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

export const COMPANY_ADMIN_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type CompanyAdminStatus = (typeof COMPANY_ADMIN_STATUSES)[number];

export interface CompanyAdminFilters {
  query?: string;
  status?: CompanyAdminStatus;
}

const COMPANY_ADMIN_RELATIONS = {
  categories: { with: { businessCategory: true } },
  owner: {
    columns: {
      id: true,
      displayName: true,
    },
  },
} as const;

/**
 * One WHERE for the page of rows and for the counts taken over it, so a filter
 * can never apply to one and not the other.
 */
function companyAdminWhere(filters: CompanyAdminFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(companies.name, pattern),
        ilike(companies.slug, pattern),
        ilike(companies.city, pattern),
      )!,
    );
  }

  if (filters.status) {
    conditions.push(eq(companies.moderationStatus, filters.status));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * The staff directory of companies in every moderation state, as opposed to
 * listPendingCompanies, which only ever showed the queue.
 *
 * Deliberately lean: category and owner name are what the table renders, and
 * nothing else is joined - subscriptions, referrals and audit history belong
 * to the detail view, where exactly one company is being looked at.
 */
export async function listCompaniesForAdmin(
  db: DbClient,
  filters: CompanyAdminFilters = {},
  page: PageParams = { limit: 50, offset: 0 },
) {
  return db.query.companies.findMany({
    where: companyAdminWhere(filters),
    with: COMPANY_ADMIN_RELATIONS,
    // Newest first, since the reason to open this screen is usually the
    // submission that just arrived. id breaks ties so paging stays stable.
    orderBy: [desc(companies.createdAt), desc(companies.id)],
    limit: page.limit,
    offset: page.offset,
  });
}

export type CompanyAdminView = Awaited<
  ReturnType<typeof listCompaniesForAdmin>
>[number];

/**
 * One company with the same relations the directory row carries, for the staff
 * detail view. Separate from findCompanyById, which is the plain row used by
 * the moderation paths.
 */
export async function findCompanyForAdmin(db: DbClient, companyId: string) {
  return db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    with: COMPANY_ADMIN_RELATIONS,
  });
}

export async function countCompaniesForAdmin(
  db: DbClient,
  filters: CompanyAdminFilters = {},
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(companies)
    .where(companyAdminWhere(filters));

  return row?.value ?? 0;
}

/**
 * Counts for the status filter chips. Ignores the status filter itself - a chip
 * shows what selecting it would find, not what the current selection left.
 */
export async function countCompaniesByStatus(
  db: DbClient,
  filters: Omit<CompanyAdminFilters, "status"> = {},
): Promise<Record<CompanyAdminStatus, number>> {
  const rows = await db
    .select({ status: companies.moderationStatus, value: count() })
    .from(companies)
    .where(companyAdminWhere(filters))
    .groupBy(companies.moderationStatus);

  const counts: Record<CompanyAdminStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  for (const row of rows) {
    counts[row.status] = row.value;
  }

  return counts;
}

/**
 * Move a company to a moderation outcome, once.
 *
 * Returns false when the company was already in that status, so the caller can
 * stop rather than repeat the decision's side effects. Since ADR 0019 a
 * rejection cancels a subscription and refunds an invoice, and a double-clicked
 * reject must not do either of those twice. The guard is in the WHERE clause
 * rather than in a prior read, so two concurrent requests cannot both pass it.
 */
export async function setCompanyModerationStatus(
  db: DbClient,
  companyId: string,
  status: "approved" | "rejected",
  reason: string | null,
): Promise<boolean> {
  const changed = await db
    .update(companies)
    .set({
      moderationStatus: status,
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(eq(companies.id, companyId), ne(companies.moderationStatus, status)),
    )
    .returning({ id: companies.id });

  return changed.length > 0;
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
  businessCategoryIds?: number[];
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
  if (changes.description !== undefined)
    updates.description = changes.description;
  if (changes.discount !== undefined) updates.discount = changes.discount;

  await db.update(companies).set(updates).where(eq(companies.id, companyId));

  if (changes.businessCategoryIds !== undefined) {
    await db
      .delete(companyCategories)
      .where(eq(companyCategories.companyId, companyId));
    if (changes.businessCategoryIds.length > 0) {
      await db.insert(companyCategories).values(
        changes.businessCategoryIds.map((businessCategoryId) => ({
          companyId,
          businessCategoryId,
        })),
      );
    }
  }
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
      categories: { with: { businessCategory: true } },
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

/**
 * One company the caller owns, whatever its moderation status.
 *
 * Deliberately unfiltered by status (ADR 0019): listing checkout now happens
 * before moderation, so the eligibility rule lives in the action - which
 * refuses only a company already rejected - and the checkout result pages use
 * the same lookup to name what was paid for. Publication still requires
 * approved AND an active subscription (FR-044); nothing here changes that.
 */
export async function findCompanyByOwner(
  db: DbClient,
  companyId: string,
  ownerId: string,
) {
  return db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, ownerId)),
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
