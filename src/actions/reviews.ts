"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  REVIEW_ADMIN_STATUSES,
  countReviewsByStatus,
  countReviewsForAdmin,
  deleteOwnReview,
  listReviewsForAdmin,
  moderateReview,
  upsertOwnReview,
} from "@/data/company-reviews";
import { companyListingIsPaid, findCompanyById } from "@/data/companies";
import { awaitsPaymentOutsideClub } from "@/data/membership-access";
import {
  DEFAULT_PAGE_SIZE,
  pageParamsFromSearchParam,
} from "@/data/pagination";
import { buildActor } from "@/domain/actor";
import { assertCan, can } from "@/domain/authorization";
import { reviewEligibility } from "@/domain/reviews";
import { reviewFormSchema } from "@/lib/review-form";
import { routing } from "@/i18n/routing";

export type ReviewFormState = {
  success: boolean;
  error?:
    | "unauthorized"
    | "invalid_input"
    | "not_in_club"
    | "not_found"
    | "own_company";
};

/**
 * FR-127: a member in the club reviews a published partner, or replaces the
 * review they wrote. It is published only after a moderator approves it
 * (FR-129), and nothing about the author ever reaches the page (ADR 0047).
 */
export async function submitReviewAction(
  _previous: ReviewFormState | null,
  formData: FormData,
): Promise<ReviewFormState> {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return { success: false, error: "unauthorized" };
  assertCan(buildActor(member), "create", "review");

  const parsed = reviewFormSchema.safeParse({
    companyId: formData.get("companyId"),
    rating: formData.get("rating"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { success: false, error: "invalid_input" };
  const { companyId, rating, body } = parsed.data;

  const now = new Date();
  const company = await findCompanyById(db, companyId);
  const eligibility = reviewEligibility({
    viewer: {
      id: member.id,
      inClub:
        member.status === "active" &&
        !(await awaitsPaymentOutsideClub(db, member, now)),
    },
    // Only a partner a visitor can see is reviewable: approved, not deleted,
    // and paying for its listing.
    company: company
      ? {
          ownerId: company.ownerId,
          visible:
            company.moderationStatus === "approved" &&
            !company.deletedAt &&
            (await companyListingIsPaid(db, companyId, now)),
        }
      : null,
  });
  if (eligibility !== "reviewer") {
    return {
      success: false,
      error: eligibility === "guest" ? "unauthorized" : eligibility,
    };
  }

  const locale = (routing.locales as readonly string[]).includes(
    member.language,
  )
    ? member.language
    : routing.defaultLocale;

  await upsertOwnReview(db, {
    companyId,
    memberId: member.id,
    rating,
    body,
    locale,
    now,
  });

  revalidatePath("/dashboard/admin/reviews");
  return { success: true };
}

/** FR-128: a member withdraws their own review of one company. */
export async function deleteOwnReviewAction(companyId: string) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return { success: false, error: "unauthorized" as const };
  assertCan(buildActor(member), "delete", "own_review");

  const parsed = z.uuid().safeParse(companyId);
  if (!parsed.success)
    return { success: false, error: "invalid_input" as const };

  const deleted = await deleteOwnReview(db, parsed.data, member.id);
  if (!deleted) return { success: false, error: "not_found" as const };

  const company = await findCompanyById(db, parsed.data);
  if (company) revalidatePath(`/directory/${company.slug}`, "page");
  revalidatePath("/dashboard/admin/reviews");
  return { success: true };
}

const moderateSchema = z.object({
  reviewId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/** FR-129: a moderator publishes or refuses a review; audited (FR-087). */
export async function moderateReviewAction(input: {
  reviewId: string;
  decision: "approved" | "rejected";
}) {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return { success: false, error: "unauthorized" as const };
  const actor = buildActor(member);
  assertCan(
    actor,
    input.decision === "approved" ? "approve" : "reject",
    "review",
  );

  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "invalid_input" as const };

  const result = await moderateReview(db, {
    reviewId: parsed.data.reviewId,
    status: parsed.data.decision,
    staffId: member.id,
    now: new Date(),
  });
  if (!result) return { success: false, error: "not_found" as const };

  await appendAuditEntry(db, {
    actorType: actor.type === "staff" ? actor.role : actor.type,
    actorId: member.id,
    action:
      parsed.data.decision === "approved"
        ? "review.approved"
        : "review.rejected",
    subjectType: "review",
    subjectId: parsed.data.reviewId,
    meta: {
      companyId: result.companyId,
      previousStatus: result.previousStatus,
    },
  });

  const company = await findCompanyById(db, result.companyId);
  if (company) revalidatePath(`/directory/${company.slug}`, "page");
  revalidatePath("/dashboard/admin/reviews");
  return { success: true };
}

const reviewListParamsSchema = z.object({
  query: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(REVIEW_ADMIN_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

/** The staff moderation queue (FR-129); empty for anyone who cannot moderate. */
export async function getReviewsForAdminAction(
  params: { query?: string; status?: string; page?: string | number } = {},
) {
  const empty = {
    rows: [],
    total: 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    statusCounts: { pending: 0, approved: 0, rejected: 0 },
  };
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member) return empty;
  const actor = buildActor(member);
  if (!can(actor, "approve", "review") && !can(actor, "reject", "review")) {
    return empty;
  }

  const { query, status, page } = reviewListParamsSchema.parse(params);
  const filters = { query: query || undefined, status };
  const [total, statusCounts] = await Promise.all([
    countReviewsForAdmin(db, filters),
    countReviewsByStatus(db, { query: filters.query }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = await listReviewsForAdmin(
    db,
    filters,
    pageParamsFromSearchParam(currentPage, DEFAULT_PAGE_SIZE),
  );

  return {
    rows,
    total,
    page: currentPage,
    pageSize: DEFAULT_PAGE_SIZE,
    statusCounts,
  };
}

/** The sidebar badge: reviews waiting for a moderator, 0 for anyone else. */
export async function countPendingReviewsAction(): Promise<number> {
  const current = await getCurrentMember();
  const member = current?.member;
  if (!member || !can(buildActor(member), "approve", "review")) return 0;
  const counts = await countReviewsByStatus(db);
  return counts.pending;
}
