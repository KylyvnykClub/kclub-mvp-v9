import { and, avg, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import type { DbClient } from "./db";
import type { PageParams } from "./pagination";
import { companies, companyReviews, members } from "./schema";
import type { ReviewStatus } from "./schema/company-reviews";

/**
 * Partner reviews (ADR 0047, FR-127…FR-130).
 *
 * Two kinds of read live here and must not be confused. The public ones -
 * `listApprovedReviews`, `approvedReviewSummary` - select columns by name and
 * never the member: whoever wrote a review is not disclosed to anyone but
 * staff (ADR 0005). The staff ones join the member for moderation.
 */

export const REVIEW_ADMIN_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const satisfies readonly ReviewStatus[];

/**
 * Write a member's review, or replace the one they already wrote. Any edit
 * goes back to moderation: an approved review changed afterwards is a new
 * text nobody has read yet.
 */
export async function upsertOwnReview(
  db: DbClient,
  review: {
    companyId: string;
    memberId: string;
    rating: number;
    body: string;
    locale: string;
    now: Date;
  },
): Promise<void> {
  await db
    .insert(companyReviews)
    .values({
      companyId: review.companyId,
      memberId: review.memberId,
      rating: review.rating,
      body: review.body,
      locale: review.locale,
      status: "pending",
      createdAt: review.now,
      updatedAt: review.now,
    })
    .onConflictDoUpdate({
      target: [companyReviews.companyId, companyReviews.memberId],
      set: {
        rating: review.rating,
        body: review.body,
        locale: review.locale,
        status: "pending",
        updatedAt: review.now,
        moderatedAt: null,
        moderatedBy: null,
      },
    });
}

/** The caller's own review of one company, whatever its status. */
export async function findOwnReview(
  db: DbClient,
  companyId: string,
  memberId: string,
) {
  const [row] = await db
    .select({
      rating: companyReviews.rating,
      body: companyReviews.body,
      status: companyReviews.status,
    })
    .from(companyReviews)
    .where(
      and(
        eq(companyReviews.companyId, companyId),
        eq(companyReviews.memberId, memberId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function deleteOwnReview(
  db: DbClient,
  companyId: string,
  memberId: string,
): Promise<boolean> {
  const rows = await db
    .delete(companyReviews)
    .where(
      and(
        eq(companyReviews.companyId, companyId),
        eq(companyReviews.memberId, memberId),
      ),
    )
    .returning({ id: companyReviews.id });
  return rows.length > 0;
}

/**
 * What a visitor reads on a partner's page: the approved reviews, newest
 * first. Columns named one by one so the author cannot reach the page by a
 * later `select *`.
 */
export async function listApprovedReviews(
  db: DbClient,
  companyId: string,
  limit = 20,
) {
  return db
    .select({
      id: companyReviews.id,
      rating: companyReviews.rating,
      body: companyReviews.body,
      createdAt: companyReviews.createdAt,
    })
    .from(companyReviews)
    .where(
      and(
        eq(companyReviews.companyId, companyId),
        eq(companyReviews.status, "approved"),
      ),
    )
    .orderBy(desc(companyReviews.createdAt), desc(companyReviews.id))
    .limit(limit);
}

export type PublicReview = Awaited<
  ReturnType<typeof listApprovedReviews>
>[number];

/** The stars and the count shown above the reviews: approved ones only. */
export async function approvedReviewSummary(
  db: DbClient,
  companyId: string,
): Promise<{ count: number; average: number | null }> {
  const [row] = await db
    .select({ value: count(), average: avg(companyReviews.rating) })
    .from(companyReviews)
    .where(
      and(
        eq(companyReviews.companyId, companyId),
        eq(companyReviews.status, "approved"),
      ),
    );
  return {
    count: row?.value ?? 0,
    average: row?.average ? Number(row.average) : null,
  };
}

export interface ReviewAdminFilters {
  query?: string;
  status?: ReviewStatus;
}

function reviewAdminWhere(filters: ReviewAdminFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.status)
    conditions.push(eq(companyReviews.status, filters.status));
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(ilike(companies.name, pattern), ilike(companyReviews.body, pattern))!,
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** The moderation queue: staff see who wrote each review (ADR 0047). */
export async function listReviewsForAdmin(
  db: DbClient,
  filters: ReviewAdminFilters,
  page: PageParams,
) {
  return db
    .select({
      id: companyReviews.id,
      rating: companyReviews.rating,
      body: companyReviews.body,
      locale: companyReviews.locale,
      status: companyReviews.status,
      createdAt: companyReviews.createdAt,
      updatedAt: companyReviews.updatedAt,
      companyName: companies.name,
      companySlug: companies.slug,
      authorName: members.displayName,
      authorPhone: members.phone,
    })
    .from(companyReviews)
    .innerJoin(companies, eq(companies.id, companyReviews.companyId))
    .innerJoin(members, eq(members.id, companyReviews.memberId))
    .where(reviewAdminWhere(filters))
    .orderBy(desc(companyReviews.updatedAt), desc(companyReviews.id))
    .limit(page.limit)
    .offset(page.offset);
}

export type AdminReviewRow = Awaited<
  ReturnType<typeof listReviewsForAdmin>
>[number];

export async function countReviewsForAdmin(
  db: DbClient,
  filters: ReviewAdminFilters,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(companyReviews)
    .innerJoin(companies, eq(companies.id, companyReviews.companyId))
    .where(reviewAdminWhere(filters));
  return row?.value ?? 0;
}

/** Counts for the status chips; ignores the status filter itself. */
export async function countReviewsByStatus(
  db: DbClient,
  filters: Omit<ReviewAdminFilters, "status"> = {},
): Promise<Record<ReviewStatus, number>> {
  const rows = await db
    .select({ status: companyReviews.status, value: count() })
    .from(companyReviews)
    .innerJoin(companies, eq(companies.id, companyReviews.companyId))
    .where(reviewAdminWhere(filters))
    .groupBy(companyReviews.status);

  const counts: Record<ReviewStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of rows) counts[row.status] = row.value;
  return counts;
}

/**
 * Approve or reject one review. Returns the company it belongs to, or null
 * when there is no such review, so the caller can audit and revalidate.
 */
export async function moderateReview(
  db: DbClient,
  params: {
    reviewId: string;
    status: "approved" | "rejected";
    staffId: string;
    now: Date;
  },
): Promise<{ companyId: string; previousStatus: ReviewStatus } | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        companyId: companyReviews.companyId,
        status: companyReviews.status,
      })
      .from(companyReviews)
      .where(eq(companyReviews.id, params.reviewId))
      .for("update");
    if (!before) return null;

    await tx
      .update(companyReviews)
      .set({
        status: params.status,
        moderatedAt: params.now,
        moderatedBy: params.staffId,
      })
      .where(eq(companyReviews.id, params.reviewId));

    return { companyId: before.companyId, previousStatus: before.status };
  });
}
