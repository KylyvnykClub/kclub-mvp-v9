"use server";

import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import { enqueueOutbox } from "@/data/outbox";
import {
  companySlugExists,
  findApprovedCompanyBySlug,
  findCategoryById,
  insertCompany,
  listActiveCategoriesByBlock,
  listActiveCategoryBlocks,
  listActiveSubcategories,
  listApprovedCompaniesByIds,
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
import { getCurrentMember } from "./session";
import { isFeatureEnabled } from "./feature-flags";
import { buildActor } from "@/domain/actor";
import { assertCan, can } from "@/domain/authorization";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

export const COMPANY_MODERATION_TOPIC = "company.moderation";

const PROHIBITED_CATEGORY_KEYWORDS = [
  "gambling",
  "casino",
  "cryptocurrency",
  "crypto",
  "token",
  "weapons",
  "firearms",
  "adult",
  "pornography",
  "unlicensed financial",
  "high-risk investment",
];

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

const registerCompanySchema = z.object({
  name: z
    .string()
    .min(2, "Company name must be at least 2 characters")
    .max(255),
  legalName: z.string().max(255).optional(),
  taxId: z.string().max(50).optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: z.string().max(1000).optional(),
  businessCategoryId: z.coerce
    .number()
    .int()
    .positive("Please select a business category"),

  discount: z.string().max(255).optional(),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  contactEmail: z
    .string()
    .email("Must be a valid email")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().max(50).optional(),

  country: z.string().min(2, "Country is required").max(100),
  city: z.string().min(2, "City is required").max(100),
});

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

    const categoryText = [
      category.block,
      category.category,
      category.subcategory,
    ]
      .join(" ")
      .toLowerCase();
    const isProhibited = PROHIBITED_CATEGORY_KEYWORDS.some((kw) =>
      categoryText.includes(kw),
    );
    if (isProhibited) {
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

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
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
