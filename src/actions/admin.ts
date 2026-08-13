"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  createBusinessCategory,
  createCity,
  createCountry,
  deleteBusinessCategory,
  deleteCity,
  deleteCountry,
  setCategoryStatus,
  setCityStatus,
  setCountryStatus,
} from "@/data/companies";
import { buildActor, normalizeRole } from "@/domain/actor";
import { can } from "@/domain/authorization";

const categorySchema = z.object({
  block: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(255),
  subcategory: z.string().trim().min(1).max(255),
});

const countrySchema = z.object({
  code: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(255),
});

const citySchema = z.object({
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(255),
});

async function requireReferenceManager() {
  const result = await getCurrentMember();
  if (!result?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(result.member);
  if (!can(actor, "manage_reference_data", "reference_data")) {
    throw new Error("Unauthorized");
  }

  return {
    id: result.member.id,
    role: normalizeRole(result.member.role),
  };
}

async function auditReferenceChange(input: {
  actor: { id: string; role: string };
  action: string;
  subjectId: string;
  before?: unknown;
  after?: unknown;
}) {
  await appendAuditEntry(db, {
    actorType: input.actor.role,
    actorId: input.actor.id,
    action: input.action,
    subjectType: "reference_data",
    subjectId: input.subjectId,
    meta: {
      before: input.before ?? null,
      after: input.after ?? null,
    },
  });
}

export async function toggleCategoryStatusAction(
  categoryId: number,
  currentStatus: string,
) {
  const actor = await requireReferenceManager();

  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  await setCategoryStatus(db, categoryId, newStatus);
  await auditReferenceChange({
    actor,
    action: "set_category_status",
    subjectId: String(categoryId),
    before: { status: currentStatus },
    after: { status: newStatus },
  });

  revalidatePath("/dashboard/admin/categories");
}

export async function createCategoryAction(formData: FormData) {
  const actor = await requireReferenceManager();
  const input = categorySchema.parse({
    block: formData.get("block"),
    category: formData.get("category"),
    subcategory: formData.get("subcategory"),
  });
  const category = await createBusinessCategory(db, input);
  await auditReferenceChange({
    actor,
    action: "create_category",
    subjectId: String(category.id),
    after: category,
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function deleteCategoryAction(categoryId: number) {
  const actor = await requireReferenceManager();
  await deleteBusinessCategory(db, categoryId);
  await auditReferenceChange({
    actor,
    action: "delete_category",
    subjectId: String(categoryId),
    before: { id: categoryId },
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function createCountryAction(formData: FormData) {
  const actor = await requireReferenceManager();
  const input = countrySchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
  });
  const country = await createCountry(db, input);
  await auditReferenceChange({
    actor,
    action: "create_country",
    subjectId: country.code,
    after: country,
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function toggleCountryStatusAction(
  code: string,
  currentStatus: string,
) {
  const actor = await requireReferenceManager();
  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await setCountryStatus(db, code, newStatus);
  await auditReferenceChange({
    actor,
    action: "set_country_status",
    subjectId: code,
    before: { status: currentStatus },
    after: { status: newStatus },
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function deleteCountryAction(code: string) {
  const actor = await requireReferenceManager();
  await deleteCountry(db, code);
  await auditReferenceChange({
    actor,
    action: "delete_country",
    subjectId: code,
    before: { code },
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function createCityAction(formData: FormData) {
  const actor = await requireReferenceManager();
  const input = citySchema.parse({
    countryCode: formData.get("countryCode"),
    name: formData.get("name"),
  });
  const city = await createCity(db, input);
  await auditReferenceChange({
    actor,
    action: "create_city",
    subjectId: String(city.id),
    after: city,
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function toggleCityStatusAction(
  cityId: number,
  currentStatus: string,
) {
  const actor = await requireReferenceManager();
  const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await setCityStatus(db, cityId, newStatus);
  await auditReferenceChange({
    actor,
    action: "set_city_status",
    subjectId: String(cityId),
    before: { status: currentStatus },
    after: { status: newStatus },
  });
  revalidatePath("/dashboard/admin/categories");
}

export async function deleteCityAction(cityId: number) {
  const actor = await requireReferenceManager();
  await deleteCity(db, cityId);
  await auditReferenceChange({
    actor,
    action: "delete_city",
    subjectId: String(cityId),
    before: { id: cityId },
  });
  revalidatePath("/dashboard/admin/categories");
}
