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
  listCompanyIdsWithActiveSubscription,
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
   * once the company exists (FR-109). Nothing opens checkout with it - since
   * ADR 0036 there is nothing to pay for until a moderator has approved it.
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

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);
  if (activeCompanyIds.length === 0) return [];

  return listPartnerCountryCodes(db, activeCompanyIds);
}

/**
 * The country/city options for the catalogue filter, scoped to partners the
 * caller could actually see.
 */
export async function getPartnerLocationsAction() {
  if (SKIP_DB_PRERENDER) return [];

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);
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

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);

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

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);

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

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);

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

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);
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

  const pending = await listPendingCompanies(db);

  return { success: true, data: pending };
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
  rows: [] as (CompanyAdminView & { paid: boolean })[],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  statusCounts: { pending: 0, approved: 0, rejected: 0 },
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
  const filters = { query: query || undefined, status };

  const [total, statusCounts] = await Promise.all([
    countCompaniesForAdmin(db, filters),
    countCompaniesByStatus(db, { query: filters.query }),
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

  // Since ADR 0036 every company reaches the queue unpaid: there is nothing
  // to charge for until a moderator has approved it. The indicator therefore
  // marks approved listings that have been paid for and gone live, and the
  // queue is never filtered by it - FR-042 says a submitted company enters the
  // queue, and filtering would hide the very rows waiting to be judged.
  const paidIds = new Set(await listCompanyIdsWithActiveSubscription(db));
  const rows = page_
    .map((company) => ({ ...company, paid: paidIds.has(company.id) }))
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

  const [subscriptions, referralCounts, referrals, history] = await Promise.all(
    [
      listSubscriptionsByCompanyId(db, parsed.data),
      countReferralsByRecipientCompany(db, parsed.data),
      listReferralsByRecipientCompany(db, parsed.data, 10),
      searchAuditLogs(db, { target: parsed.data }),
    ],
  );

  return {
    success: true,
    data: { company, subscriptions, referralCounts, referrals, history },
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

  // Idempotency for the whole decision, enforced in the UPDATE's own WHERE so
  // two concurrent requests cannot both pass it. A repeat must not re-audit,
  // re-notify, or refund a second time.
  const changed = await setCompanyModerationStatus(
    db,
    id,
    status,
    reason ?? null,
  );
  if (!changed) {
    return { success: true, alreadyApplied: true };
  }

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.moderated",
    subjectType: "company",
    subjectId: id,
    meta: { status, reason: reason ?? null },
  });

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
  });

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true };
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

  await setCompanyModerationStatus(db, companyId, "approved", null);

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.unhidden",
    subjectType: "company",
    subjectId: companyId,
    meta: {},
  });

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
