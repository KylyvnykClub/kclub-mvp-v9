"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import { enqueueOutbox } from "@/data/outbox";
import {
  companySlugExists,
  COMPANY_ADMIN_STATUSES,
  countCompaniesByStatus,
  countCompaniesForAdmin,
  findApprovedCompanyBySlug,
  findCompanyForAdmin,
  findCategoryById,
  insertCompany,
  listActiveCategoriesByBlock,
  listActiveCategoryBlocks,
  listActiveSubcategories,
  listApprovedCompaniesByIds,
  listCompaniesForAdmin,
  listCompanyIdsWithActiveSubscription,
  listPendingCompanies,
  listShowcaseCompanies,
  applyCompanyPendingChanges,
  clearCompanyPendingChanges,
  findCompanyById,
  listCompaniesWithPendingChanges,
  setCompanyModerationStatus,
  setCompanyPendingChanges,
  setCompanyShowcase,
  updateCompanyFields,
  validateCityBelongsToCountry,
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
  COMPANY_STEP_SCHEMAS,
  companyDraftDataSchema,
  isCompanyStep,
  registerCompanySchema,
  type CompanyDraftData,
  type CompanyStepNumber,
} from "@/lib/company-form";
import { isProhibitedCategory } from "@/lib/prohibited-categories";
import { z } from "zod";
import { revalidatePath } from "next/cache";

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

export type CompanyFormState = { success: boolean; error?: string };

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function registerCompanyAction(
  _prevState: CompanyFormState | null,
  formData: FormData,
): Promise<CompanyFormState> {
  try {
    const auth = await getCurrentMember();
    if (!auth || !auth.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "create", "own_company");

    const data = Object.fromEntries(formData.entries());
    const parsed = registerCompanySchema.safeParse(data);

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const category = await findCategoryById(db, parsed.data.businessCategoryId);
    if (!category) {
      return { success: false, error: "Invalid business category" };
    }

    if (isProhibitedCategory(category)) {
      return {
        success: false,
        error: "This business category is not permitted",
      };
    }

    const cityValid = await validateCityBelongsToCountry(
      db,
      parsed.data.city,
      parsed.data.country,
    );
    if (!cityValid) {
      return {
        success: false,
        error: "The selected city does not belong to the selected country",
      };
    }

    const baseSlug = generateSlug(parsed.data.name);
    let finalSlug = baseSlug;

    let isUnique = false;
    let counter = 1;
    while (!isUnique) {
      const exists = await companySlugExists(db, finalSlug);
      if (!exists) {
        isUnique = true;
      } else {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    await insertCompany(db, {
      ownerId: auth.member.id,
      name: parsed.data.name,
      slug: finalSlug,
      legalName: parsed.data.legalName,
      taxId: parsed.data.taxId,
      website: parsed.data.website,
      description: parsed.data.description,
      businessCategoryId: parsed.data.businessCategoryId,
      discount: parsed.data.discount,
      logoUrl: parsed.data.logoUrl,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
      country: parsed.data.country,
      city: parsed.data.city,
      moderationStatus: "pending",
    });

    // The application is now a company; the draft has served its purpose.
    await deleteCompanyDraft(db, auth.member.id);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

export type CompanyDraftState = { success: boolean; error?: string };

export type CompanyDraftSnapshot = {
  step: CompanyStepNumber;
  data: CompanyDraftData;
};

/**
 * Save one completed step of the submission form (FR-040).
 *
 * Only the fields belonging to `step` are validated here - the applicant has
 * not filled the later ones in yet, and rejecting a draft for that would defeat
 * the point of saving it. The full schema is enforced on submission.
 */
export async function saveCompanyDraftAction(
  step: number,
  values: Record<string, string>,
): Promise<CompanyDraftState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "create", "own_company");

    if (!isCompanyStep(step)) {
      return { success: false, error: "Unknown step" };
    }

    const stepSchema =
      COMPANY_STEP_SCHEMAS[step as keyof typeof COMPANY_STEP_SCHEMAS];
    if (stepSchema) {
      const parsedStep = stepSchema.safeParse(values);
      if (!parsedStep.success) {
        return { success: false, error: parsedStep.error.issues[0]?.message };
      }
    }

    // Merge over what is already stored so a save of step 2 does not wipe the
    // answers given in step 1.
    const existing = await findCompanyDraftByOwner(db, auth.member.id);
    const previous = existing
      ? (companyDraftDataSchema.safeParse(existing.data).data ?? {})
      : {};
    const merged = companyDraftDataSchema.safeParse({ ...previous, ...values });

    await upsertCompanyDraft(
      db,
      auth.member.id,
      step,
      merged.success ? merged.data : previous,
    );

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Resume point for the submission form, or null when there is no draft. */
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

  return {
    step: isCompanyStep(draft.step) ? draft.step : 1,
    data: parsed.success ? parsed.data : {},
  };
}

/** Abandon an application deliberately, rather than waiting for retention. */
export async function discardCompanyDraftAction(): Promise<CompanyDraftState> {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    return { success: false, error: "Unauthorized" };
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "create", "own_company");

  await deleteCompanyDraft(db, auth.member.id);

  return { success: true };
}

export async function getPartnersListAction(filters?: PartnerFilters) {
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

  return listApprovedCompaniesByIds(db, activeCompanyIds, filters);
}

export async function getPublicShowcasePartners() {
  if (SKIP_DB_PRERENDER) {
    return { top: [], featured: [] };
  }

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);

  if (activeCompanyIds.length === 0) return { top: [], featured: [] };

  const [top, featured] = await Promise.all([
    listShowcaseCompanies(db, activeCompanyIds, "top", 3),
    listShowcaseCompanies(db, activeCompanyIds, "featured", 3),
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
  rows: [],
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
  const rows = await listCompaniesForAdmin(
    db,
    filters,
    pageParamsFromSearchParam(currentPage, DEFAULT_PAGE_SIZE),
  );

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

  await setCompanyModerationStatus(db, id, status, reason ?? null);

  await appendAuditEntry(db, {
    actorType: "staff",
    actorId: auth.member.id,
    action: "company.moderated",
    subjectType: "company",
    subjectId: id,
    meta: { status, reason: reason ?? null },
  });

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
  businessCategoryId: z.coerce.number().int().positive().optional(),
  description: z.string().max(1000).optional(),
  discount: z.string().max(255).optional(),
});

export async function ownerEditCompanyAction(
  _prevState: CompanyFormState | null,
  formData: FormData,
): Promise<CompanyFormState> {
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
    if (
      parsed.data.businessCategoryId !== undefined &&
      parsed.data.businessCategoryId !== company.businessCategoryId
    ) {
      changes.businessCategoryId = parsed.data.businessCategoryId;
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
