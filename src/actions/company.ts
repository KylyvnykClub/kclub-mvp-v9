"use server";

import { db } from "@/data/db";
import type { PageParams } from "@/data/pagination";
import { appendAuditEntry } from "@/data/audit-log";
import { BILLING_REFUND_RETRY_TOPIC, enqueueOutbox } from "@/data/outbox";
import { createNotification } from "@/data/notifications";
import {
  COMPANY_ADMIN_STATUSES,
  countCompaniesByStatus,
  countCompaniesForAdmin,
  findApprovedCompanyBySlug,
  findCompanyForAdmin,
  listActiveCategoriesByBlock,
  listActiveCategoryBlocks,
  listActiveSubcategories,
  listLocalizedCategoryTree,
  countApprovedCompaniesByIds,
  listPartnerCountryCodes,
  listPartnerLocations,
  listApprovedCompaniesByIds,
  listCompaniesForAdmin,
  type CompanyAdminView,
  listCompanyIdsWithPaidListing,
  listPendingCompanies,
  listShowcaseCompanies,
  listSimilarApprovedCompanies,
  applyCompanyPendingChanges,
  clearCompanyPendingChanges,
  findCompanyById,
  listCompaniesWithPendingChanges,
  setCompanyModerationStatus,
  setCompanyPendingChanges,
  setCompanyShowcase,
  updateCompanyFields,
  type PartnerFilters,
} from "@/data/companies";
import {
  DEFAULT_PAGE_SIZE,
  pageParamsFromSearchParam,
} from "@/data/pagination";
import { listSubscriptionsByCompanyId } from "@/data/billing";
import {
  countReferralsByRecipientCompany,
  listReferralsByRecipientCompany,
} from "@/data/referrals";
import { searchAuditLogs } from "@/data/audit-log";
import {
  deleteCompanyDraft,
  findCompanyDraftByOwner,
  upsertCompanyDraft,
} from "@/data/company-drafts";
import { getCurrentMember } from "./session";
import { isFeatureEnabled } from "./feature-flags";
import { buildActor } from "@/domain/actor";
import { assertCan, can } from "@/domain/authorization";
import { COMPANY_MODERATION_TOPIC } from "@/modules/moderation/outbox";
import {
  productionRefundDeps,
  refundListingForCompany,
} from "@/modules/billing/refund";
import {
  LISTING_HOLD_SETTLE_TOPIC,
  productionListingHoldDeps,
  refundCapturedListingHolds,
  settleListingHolds,
} from "@/modules/billing/listing-hold";
import { listListingHoldsByCompany } from "@/data/listing-holds";
import {
  holdIsCapturable,
  holdIsOpen,
  type ListingHoldAction,
} from "@/domain/listing-hold";
import {
  companyDraftDataSchema,
  type CompanyDraftData,
  type CompanyFormIssue,
} from "@/lib/company-form";
import { submitCompany } from "@/modules/catalogue/submit-company";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { deleteDraftMedia } from "@/modules/platform/draft-media-storage";

const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

export async function getBlocksAction() {
  return listActiveCategoryBlocks(db);
}

export async function getCategoriesByBlockAction(block: string) {
  return listActiveCategoriesByBlock(db, block);
}

export async function getSubcategoriesByCategoryAction(
  block: string,
  category: string,
) {
  return listActiveSubcategories(db, block, category);
}

export async function getLocalizedCategoryTreeAction(
  locale: "en" | "ru" | "uk",
) {
  return listLocalizedCategoryTree(db, locale);
}

export type CompanyFormState = {
  success: boolean;
  /**
   * Why the submission was refused, as a code the form renders in the
   * applicant's own language. Never a raw exception message: a Drizzle failure
   * carries the statement and its bound values, which security.md §3 forbids
   * even in a log, let alone in a page.
   */
  issue?: CompanyFormIssue;
  /**
   * The application that was filed. The dashboard form does not use it; the
   * partner application does, to attach the photos it holds in the browser
   * once the company exists (FR-109). The dashboard form uses it to offer the
   * card hold straight away (ADR 0037, FR-113).
   */
  companyId?: string;
};

export async function registerCompanyAction(
  _prevState: CompanyFormState | null,
  formData: FormData,
): Promise<CompanyFormState> {
  const auth = await getCurrentMember();
  if (!auth || !auth.member) {
    return { success: false, issue: { code: "unauthorized" } };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "create", "own_company");

  // The work is in `submitCompany`, shared with the partner application
  // (FR-109). What belongs here is the one thing that form does differently:
  // the owner is whoever is signed in.
  return submitCompany(db, auth.member.id, formData);
}

export type CompanyDraftState = { success: boolean; issue?: CompanyFormIssue };

export type CompanyDraftSnapshot = {
  data: CompanyDraftData;
};

/**
 * Keep what the applicant has typed so far (FR-040).
 *
 * Nothing is validated here beyond "these are fields this form has": the
 * applicant is mid-sentence, and refusing to remember a half-typed answer is
 * exactly the moment a draft exists to survive. `companyDraftDataSchema` is
 * the whole submission made partial, so an unknown key is dropped rather than
 * stored, and the full schema is enforced on submission.
 *
 * Merged over what is already stored, so a save that carries only the fields
 * on screen cannot wipe the ones that are not.
 */
export async function saveCompanyDraftAction(
  values: Record<string, string>,
): Promise<CompanyDraftState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, issue: { code: "unauthorized" } };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "create", "own_company");

    const existing = await findCompanyDraftByOwner(db, auth.member.id);
    const previous = existing
      ? (companyDraftDataSchema.safeParse(existing.data).data ?? {})
      : {};
    const merged = companyDraftDataSchema.safeParse({ ...previous, ...values });

    await upsertCompanyDraft(
      db,
      auth.member.id,
      merged.success ? merged.data : previous,
    );

    return { success: true };
  } catch (error) {
    logger.error("Company draft save failed", safeErrorFields(error));
    return { success: false, issue: { code: "unexpected" } };
  }
}

/** What the applicant last typed, or null when there is no draft. */
export async function getCompanyDraftAction(): Promise<CompanyDraftSnapshot | null> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return null;
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "create", "own_company")) {
    return null;
  }

  const draft = await findCompanyDraftByOwner(db, auth.member.id);
  if (!draft) {
    return null;
  }

  const parsed = companyDraftDataSchema.safeParse(draft.data);

  return { data: parsed.success ? parsed.data : {} };
}

/** Abandon an application deliberately, rather than waiting for retention. */
export async function discardCompanyDraftAction(): Promise<CompanyDraftState> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, issue: { code: "unauthorized" } };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "create", "own_company");

  await deleteCompanyDraft(db, auth.member.id);
  try {
    await deleteDraftMedia(auth.member.id);
  } catch (error) {
    logger.error("Draft media cleanup failed", safeErrorFields(error));
  }

  return { success: true };
}

/**
 * The registration countries of the published partners, for the landing page's
 * "international community" band (ADR 0034: the landing page is public, and so
 * is this - it names countries, never partners or members).
 */
export async function getPartnerCountryCodesAction() {
  if (SKIP_DB_PRERENDER) return [];

  const activeCompanyIds = await listCompanyIdsWithPaidListing(db, new Date());
  if (activeCompanyIds.length === 0) return [];

  return listPartnerCountryCodes(db, activeCompanyIds);
}

/**
 * The country/city options for the catalogue filter, scoped to partners the
 * caller could actually see.
 */
export async function getPartnerLocationsAction() {
  if (SKIP_DB_PRERENDER) return [];

  const activeCompanyIds = await listCompanyIdsWithPaidListing(db, new Date());
  if (activeCompanyIds.length === 0) return [];

  return listPartnerLocations(db, activeCompanyIds);
}

/**
 * One page of the catalogue, plus how many partners the filters match in total.
 *
 * The total is what lets the page render "page 2 of 7" rather than guessing
 * from a short final page.
 */
export async function getPartnersListAction(
  filters?: PartnerFilters,
  page?: PageParams,
) {
  if (SKIP_DB_PRERENDER) {
    return { rows: [], total: 0 };
  }

  const auth = await getCurrentMember();
  if (!auth?.member) {
    const isPublic = await isFeatureEnabled("public_catalogue");
    if (!isPublic) throw new Error("Unauthorized");
  }

  const activeCompanyIds = await listCompanyIdsWithPaidListing(db, new Date());

  if (activeCompanyIds.length === 0) return { rows: [], total: 0 };

  const [rows, total] = await Promise.all([
    listApprovedCompaniesByIds(db, activeCompanyIds, filters, page),
    countApprovedCompaniesByIds(db, activeCompanyIds, filters),
  ]);

  return { rows, total };
}

export async function getPublicShowcasePartners() {
  if (SKIP_DB_PRERENDER) {
    return { top: [], featured: [] };
  }

  const activeCompanyIds = await listCompanyIdsWithPaidListing(db, new Date());

  if (activeCompanyIds.length === 0) return { top: [], featured: [] };

  // Three "top" partners are the hero row; the "featured" block fills a 3x3
  // grid further down, so it asks for nine.
  const [top, featured] = await Promise.all([
    listShowcaseCompanies(db, activeCompanyIds, "top", 3),
    listShowcaseCompanies(db, activeCompanyIds, "featured", 9),
  ]);

  return { top, featured };
}

export async function getPartnerBySlugAction(slug: string) {
  if (SKIP_DB_PRERENDER) {
    return null;
  }

  const auth = await getCurrentMember();
  if (!auth?.member) {
    const isPublic = await isFeatureEnabled("public_catalogue");
    if (!isPublic) throw new Error("Unauthorized");
  }

  const activeCompanyIds = await listCompanyIdsWithPaidListing(db, new Date());

  if (activeCompanyIds.length === 0) return null;

  return findApprovedCompanyBySlug(db, slug, activeCompanyIds);
}

/**
 * Other publishable partners sharing a subcategory with this one, for the
 * "similar partners" rail. Same gate as `getPartnerBySlugAction`: an anonymous
 * caller only gets a result while the public catalogue flag is on.
 */
export async function getSimilarPartnersAction(
  companyId: string,
  businessCategoryIds: number[],
) {
  if (SKIP_DB_PRERENDER) {
    return [];
  }

  const auth = await getCurrentMember();
  if (!auth?.member) {
    const isPublic = await isFeatureEnabled("public_catalogue");
    if (!isPublic) throw new Error("Unauthorized");
  }

  const activeCompanyIds = await listCompanyIdsWithPaidListing(db, new Date());
  if (activeCompanyIds.length === 0) return [];

  return listSimilarApprovedCompanies(
    db,
    activeCompanyIds,
    companyId,
    businessCategoryIds,
  );
}

export async function getPendingCompaniesAction() {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized", data: [] };
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "read", "company")) {
    return { success: false, error: "Unauthorized", data: [] };
  }

  // Every row of the queue has its price held on the card (FR-113).
  const pending = await listPendingCompanies(db, new Date());

  return {
    success: true,
    data: pending.map((company) => ({ ...company, cardHeld: true })),
  };
}

/**
 * The values come straight off the query string, so an unknown status or a
 * nonsense page narrows to nothing sensible rather than throwing.
 */
const companiesListParamsSchema = z.object({
  query: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(COMPANY_ADMIN_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

const EMPTY_COMPANY_PAGE = {
  rows: [] as (CompanyAdminView & { paid: boolean; cardHeld: boolean })[],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  statusCounts: { pending: 0, awaiting_payment: 0, approved: 0, rejected: 0 },
};

export async function getCompaniesForAdminAction(
  params: { query?: string; status?: string; page?: string | number } = {},
) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized", data: EMPTY_COMPANY_PAGE };
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "read", "company")) {
    return { success: false, error: "Unauthorized", data: EMPTY_COMPANY_PAGE };
  }

  const { query, status, page } = companiesListParamsSchema.parse(params);
  const now = new Date();
  const filters = { query: query || undefined, status, now };

  const [total, statusCounts] = await Promise.all([
    countCompaniesForAdmin(db, filters),
    countCompaniesByStatus(db, { query: filters.query, now }),
  ]);

  // Counting first means a page past the end lands on the last real page
  // instead of an empty table under a heading that claims otherwise.
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const page_ = await listCompaniesForAdmin(
    db,
    filters,
    pageParamsFromSearchParam(currentPage, DEFAULT_PAGE_SIZE),
  );

  // `paid` marks approved listings that have been paid for and gone live.
  // The queue itself is filtered by the hold in the data layer (FR-113).
  // `cardHeld` comes with each row from the query: the price is reserved on
  // the card, ready to be captured by an approval (ADR 0037).
  const paidIds = new Set(await listCompanyIdsWithPaidListing(db, now));
  const rows = page_
    .map((company) => ({
      ...company,
      paid: paidIds.has(company.id),
    }))
    .sort((a, b) => Number(b.paid) - Number(a.paid));

  return {
    success: true,
    data: {
      rows,
      total,
      page: currentPage,
      pageSize: DEFAULT_PAGE_SIZE,
      statusCounts,
    },
  };
}

const companyIdSchema = z.string().uuid();

/**
 * Everything the company drawer shows, in one round trip.
 *
 * Called when a drawer opens rather than for every row of the directory - the
 * list query stays lean precisely so this can be expensive for exactly one
 * company.
 */
export async function getCompanyAdminDetailAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized", data: null };
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "read", "company")) {
    return { success: false, error: "Unauthorized", data: null };
  }

  const parsed = companyIdSchema.safeParse(companyId);
  if (!parsed.success) {
    return { success: false, error: "Invalid company id", data: null };
  }

  const company = await findCompanyForAdmin(db, parsed.data);
  if (!company) {
    return { success: false, error: "Not found", data: null };
  }

  const [subscriptions, referralCounts, referrals, history, holds] =
    await Promise.all([
      listSubscriptionsByCompanyId(db, parsed.data),
      countReferralsByRecipientCompany(db, parsed.data),
      listReferralsByRecipientCompany(db, parsed.data, 10),
      searchAuditLogs(db, { target: parsed.data }),
      listListingHoldsByCompany(db, parsed.data),
    ]);

  const now = new Date();

  return {
    success: true,
    data: {
      company,
      subscriptions,
      referralCounts,
      referrals,
      history,
      // ADR 0037: what is on the partner's card, newest first. Stripe ids stay
      // server-side; the drawer needs amounts, states and deadlines.
      holds: holds.map((hold) => ({
        id: hold.id,
        status: hold.status,
        amountMinor: hold.amountMinor,
        currency: hold.currency,
        captureBefore: hold.captureBefore,
        captureRequestedAt: hold.captureRequestedAt,
        capturedAt: hold.capturedAt,
        refundedAt: hold.refundedAt,
        createdAt: hold.createdAt,
        capturable: holdIsCapturable(hold, now),
      })),
    },
  };
}

/**
 * Cancel and refund a rejected company's listing subscription.
 *
 * Since ADR 0036 nothing is charged before approval, so on the ordinary path
 * this finds nothing to refund and returns. It is kept, and still runs, for
 * the companies that paid while ADR 0019 was in force and for an approved
 * listing that is later rejected - both are cases where money was taken for a
 * listing that will not be published.
 *
 * Deliberately never throws. The moderation decision, its audit entry and the
 * applicant's notification have already committed by the time this runs, and a
 * moderator must not be blocked - or shown a failure - because Stripe is
 * unreachable. A failure is audited and enqueued for the next drain instead,
 * which is the same at-least-once shape the outbox gives every other external
 * effect in this codebase.
 */
async function undoListingPaymentForRejection(
  companyId: string,
  staffId: string,
): Promise<void> {
  try {
    // A listing rejected after it went live on a captured hold: that first
    // month's payment comes back too (ADR 0037).
    const refundedHolds = await refundCapturedListingHolds(
      db,
      await productionListingHoldDeps(),
      companyId,
      new Date(),
    );
    for (const hold of refundedHolds) {
      await appendAuditEntry(db, {
        actorType: "staff",
        actorId: staffId,
        action: "company.listing_refunded",
        subjectType: "company",
        subjectId: companyId,
        meta: {
          outcome: "refunded",
          paymentIntentId: hold.paymentIntentId,
          amountMinor: hold.amountMinor,
        },
      });
    }

    const result = await refundListingForCompany(
      db,
      await productionRefundDeps(),
      companyId,
    );

    if (result.outcome === "nothing_to_refund") return;

    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: staffId,
      action: "company.listing_refunded",
      subjectType: "company",
      subjectId: companyId,
      meta:
        result.outcome === "refunded"
          ? {
              outcome: result.outcome,
              subscriptionId: result.subscriptionId,
              invoiceId: result.invoiceId,
              amountMinor: result.amountMinor,
            }
          : { outcome: result.outcome, subscriptionId: result.subscriptionId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[listing-refund] failed for company ${companyId}: ${message}`,
    );

    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: staffId,
      action: "company.listing_refund_failed",
      subjectType: "company",
      subjectId: companyId,
      meta: { error: message },
    });

    await enqueueOutbox(db, BILLING_REFUND_RETRY_TOPIC, { companyId });
  }
}

/**
 * The money half of a moderation decision, for a partner whose card is held
 * (ADR 0037, FR-114, FR-115).
 *
 * Approve asks Stripe to capture and reject asks it to release - and nothing
 * more. Neither publishes, unpublishes or marks anything paid: the listing
 * goes live when Stripe's own `payment_intent.succeeded` has been projected,
 * never on the strength of this call returning.
 *
 * Deliberately never throws, for the reason the refund beside it does not: the
 * decision has committed, and a moderator must not be shown a failure because
 * Stripe is unreachable. A failure is audited and queued; the retry settles
 * from whatever the moderation status is by then, so it cannot capture for a
 * company that was rejected in the meantime.
 */
type DecisionPayment = {
  outcome: "capture_requested" | "released" | "none" | "retrying";
  actions: ListingHoldAction[];
};

async function settleListingHoldsForDecision(
  companyId: string,
  staffId: string,
): Promise<DecisionPayment> {
  try {
    const report = await settleListingHolds(
      db,
      await productionListingHoldDeps(),
      companyId,
      new Date(),
    );

    if (report.actions.length === 0) return { outcome: "none", actions: [] };

    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: staffId,
      action: "company.listing_hold_settled",
      subjectType: "company",
      subjectId: companyId,
      meta: { actions: report.actions },
    });

    return {
      outcome: report.captureRequested ? "capture_requested" : "released",
      actions: report.actions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[listing-hold] settlement failed for company ${companyId}: ${message}`,
    );

    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: staffId,
      action: "company.listing_hold_settle_failed",
      subjectType: "company",
      subjectId: companyId,
      meta: { error: message },
    });

    await enqueueOutbox(db, LISTING_HOLD_SETTLE_TOPIC, { companyId });
    return { outcome: "retrying", actions: [] };
  }
}

export async function moderateCompanyAction(
  id: string,
  status: "approved" | "rejected",
  reason?: string,
) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  if (!can(actor, status === "approved" ? "approve" : "reject", "company")) {
    return { success: false, error: "Unauthorized" };
  }

  if (!companyIdSchema.safeParse(id).success) {
    return { success: false, error: "Invalid company id" };
  }

  // Idempotency for the whole decision, enforced in the UPDATE's own WHERE so
  // two concurrent requests cannot both pass it. A repeat must not re-audit,
  // re-notify, capture or refund a second time. An approval also needs the
  // price held on the card (FR-113, ADR 0037), checked in the same WHERE.
  const changed = await setCompanyModerationStatus(
    db,
    id,
    status,
    reason ?? null,
    status === "approved"
      ? { kind: "capturable_hold", now: new Date() }
      : undefined,
  );
  if (!changed) {
    const current = await findCompanyById(db, id);
    if (current?.moderationStatus === status) {
      return { success: true, alreadyApplied: true };
    }
    return { success: false, error: "hold_required" };
  }

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.moderated",
    subjectType: "company",
    subjectId: id,
    meta: { status, reason: reason ?? null },
  });

  // Read before settling: when Stripe is down, the retry will do what the
  // rule decides now, and the notice has to say so.
  const now = new Date();
  const holdsBefore = await listListingHoldsByCompany(db, id);

  // APPROVE → capture, REJECT → release. Publication waits for the webhook.
  const payment = await settleListingHoldsForDecision(id, auth.member.id);

  // What the notice says is what was done - or, on a retry, what will be.
  const asked = (kind: ListingHoldAction["kind"]) =>
    payment.actions.some((action) => action.kind === kind);
  const paymentHeld =
    payment.outcome === "retrying"
      ? holdsBefore.some((hold) => holdIsCapturable(hold, now))
      : // Not merely asked for: a capture Stripe refused (the hold lapsed)
        // charged nothing, and the partner must be asked to pay instead.
        payment.outcome === "capture_requested";
  const holdOpen =
    payment.outcome === "retrying"
      ? holdsBefore.some(holdIsOpen)
      : asked("cancel");

  // The inbox is written here rather than in the outbox worker, because the
  // worker drains once a day and in-product state is authoritative
  // (reliability.md, ADR 0020). The outbox below still carries the email.
  const company = await findCompanyById(db, id);
  if (company) {
    await createNotification(db, {
      memberId: company.ownerId,
      kind: status === "approved" ? "company_approved" : "company_rejected",
      params: {
        companyId: id,
        companyName: company.name,
        // Free text a human wrote; no translation reaches it, so the UI renders
        // it as a quoted moderator note beside the localised shell (FR-090).
        ...(status === "rejected" && reason ? { reason } : {}),
        ...(status === "approved" && paymentHeld ? { paymentHeld: "yes" } : {}),
        ...(status === "rejected" && holdOpen ? { holdReleased: "yes" } : {}),
      },
    });
  }

  if (status === "rejected") {
    await undoListingPaymentForRejection(id, auth.member.id);
  }

  await enqueueOutbox(db, COMPANY_MODERATION_TOPIC, {
    companyId: id,
    status,
    reason: reason ?? null,
    paymentHeld: status === "approved" && paymentHeld,
  });

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true, payment: payment.outcome };
}

const showcaseSchema = z.object({
  companyId: z.string().uuid(),
  showcaseType: z.enum(["none", "top", "featured"]),
  showcaseRank: z.coerce.number().int().min(0).max(99),
});

export async function setCompanyShowcaseAction(
  companyId: string,
  showcaseType: "none" | "top" | "featured",
  showcaseRank: number,
) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "approve", "company");

  const parsed = showcaseSchema.safeParse({
    companyId,
    showcaseType,
    showcaseRank,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  await setCompanyShowcase(
    db,
    parsed.data.companyId,
    parsed.data.showcaseType,
    parsed.data.showcaseRank,
  );

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.showcase_updated",
    subjectType: "company",
    subjectId: companyId,
    meta: { showcaseType, showcaseRank },
  });

  revalidatePath("/");
  revalidatePath("/dashboard/admin/companies");
  return { success: true };
}

export async function hideCompanyAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "approve", "company");

  await setCompanyModerationStatus(
    db,
    companyId,
    "rejected",
    "Hidden by staff",
  );

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.hidden",
    subjectType: "company",
    subjectId: companyId,
    meta: {},
  });

  // A hidden company is a rejected one as far as money goes: an uncaptured
  // hold is released. A captured one is not refunded - hiding is a visibility
  // switch, and the paid month is the partner's (ADR 0037).
  await settleListingHoldsForDecision(companyId, auth.member.id);

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true };
}

export async function unhideCompanyAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "approve", "company");

  if (!z.string().uuid().safeParse(companyId).success) {
    return { success: false, error: "Invalid company id" };
  }

  // Restoring is an approval. Only a rejected or hidden company comes back,
  // and only if its listing is still paid for or a hold is on the card -
  // otherwise it would be an approval nobody paid for (FR-113).
  const restored = await setCompanyModerationStatus(
    db,
    companyId,
    "approved",
    null,
    { kind: "restorable", now: new Date() },
  );
  if (!restored) {
    const current = await findCompanyById(db, companyId);
    if (current?.moderationStatus === "approved") {
      return { success: true, alreadyApplied: true };
    }
    return { success: false, error: "hold_required" };
  }

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.unhidden",
    subjectType: "company",
    subjectId: companyId,
    meta: {},
  });

  // Restoring is an approval, so a hold still on the card is captured -
  // and, as with approve, the listing waits for Stripe to confirm it.
  await settleListingHoldsForDecision(companyId, auth.member.id);

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true };
}

const staffEditCompanySchema = z.object({
  companyId: z.string().uuid(),
  discount: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(50).optional(),
});

export async function staffEditCompanyAction(
  companyId: string,
  fields: {
    discount?: string;
    description?: string;
    contactEmail?: string;
    contactPhone?: string;
  },
) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "approve", "company");

  const parsed = staffEditCompanySchema.safeParse({ companyId, ...fields });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const updateFields: Record<string, string | null> = {};
  if (parsed.data.discount !== undefined)
    updateFields.discount = parsed.data.discount || null;
  if (parsed.data.description !== undefined)
    updateFields.description = parsed.data.description || null;
  if (parsed.data.contactEmail !== undefined)
    updateFields.contactEmail = parsed.data.contactEmail || null;
  if (parsed.data.contactPhone !== undefined)
    updateFields.contactPhone = parsed.data.contactPhone || null;

  await updateCompanyFields(db, companyId, updateFields);

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.staff_edited",
    subjectType: "company",
    subjectId: companyId,
    meta: { fields: Object.keys(updateFields) },
  });

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true };
}

const ownerEditSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(2).max(255).optional(),
  businessCategoryIds: z.preprocess((val): unknown[] | undefined => {
    if (Array.isArray(val)) return val as unknown[];
    if (typeof val === "string" && val.trim())
      return val.split(",").filter(Boolean);
    return undefined;
  }, z.array(z.coerce.number().int().positive()).min(1).max(7).optional()),
  description: z.string().max(1000).optional(),
  discount: z.string().max(255).optional(),
});

/** The owner-edit form still reports a message rather than a code (FR-042). */
export type CompanyEditState = { success: boolean; error?: string };

export async function ownerEditCompanyAction(
  _prevState: CompanyEditState | null,
  formData: FormData,
): Promise<CompanyEditState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_company");

    const data = Object.fromEntries(formData.entries());
    const parsed = ownerEditSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const company = await findCompanyById(db, parsed.data.companyId);
    if (!company || company.ownerId !== auth.member.id) {
      return { success: false, error: "Not found" };
    }

    if (company.moderationStatus !== "approved") {
      return { success: false, error: "Can only edit approved companies" };
    }

    const changes: Record<string, unknown> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== company.name) {
      changes.name = parsed.data.name;
    }
    if (parsed.data.businessCategoryIds !== undefined) {
      changes.businessCategoryIds = parsed.data.businessCategoryIds;
    }
    if (
      parsed.data.description !== undefined &&
      parsed.data.description !== (company.description ?? "")
    ) {
      changes.description = parsed.data.description;
    }
    if (
      parsed.data.discount !== undefined &&
      parsed.data.discount !== (company.discount ?? "")
    ) {
      changes.discount = parsed.data.discount;
    }

    if (Object.keys(changes).length === 0) {
      return { success: true };
    }

    await setCompanyPendingChanges(db, parsed.data.companyId, changes);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

export async function getCompaniesWithPendingChangesAction() {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized", data: [] };
  }

  const actor = buildActor(auth.member);
  if (!can(actor, "read", "company")) {
    return { success: false, error: "Unauthorized", data: [] };
  }

  const pending = await listCompaniesWithPendingChanges(db);
  return { success: true, data: pending };
}

export async function approveCompanyChangesAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "approve", "company");

  await applyCompanyPendingChanges(db, companyId);

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.changes_approved",
    subjectType: "company",
    subjectId: companyId,
    meta: {},
  });

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true };
}

export async function rejectCompanyChangesAction(
  companyId: string,
  reason?: string,
) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "reject", "company");

  await clearCompanyPendingChanges(db, companyId);

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.changes_rejected",
    subjectType: "company",
    subjectId: companyId,
    meta: { reason: reason ?? null },
  });

  revalidatePath("/dashboard/admin/companies");
  return { success: true };
}
