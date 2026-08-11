"use server";

import { db } from "@/data/db";
import {
  companySlugExists,
  findApprovedCompanyBySlug,
  insertCompany,
  listActiveCategoriesByBlock,
  listActiveCategoryBlocks,
  listActiveSubcategories,
  listApprovedCompaniesByIds,
  listCompanyIdsWithActiveSubscription,
  listPendingCompanies,
  listShowcaseCompanies,
  setCompanyModerationStatus,
  type PartnerFilters,
} from "@/data/companies";
import { getCurrentMember } from "./session";
import { isFeatureEnabled } from "./feature-flags";
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

    const data = Object.fromEntries(formData.entries());
    const parsed = registerCompanySchema.safeParse(data);

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
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
    return [];
  }

  const activeCompanyIds = await listCompanyIdsWithActiveSubscription(db);

  if (activeCompanyIds.length === 0) return [];

  // FR-034, FR-035: Showcase top 6 partners
  return listShowcaseCompanies(db, activeCompanyIds, 6);
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
  if (!auth || !auth.member || auth.member.role !== "admin") {
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
  if (!auth || !auth.member || auth.member.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  await setCompanyModerationStatus(db, id, status, reason ?? null);

  revalidatePath("/dashboard/admin/companies");
  revalidatePath("/directory");
  return { success: true };
}
