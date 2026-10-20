import type { DbClient } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  applyOwnerEdit,
  findCategoryById,
  findOwnCompanyForEdit,
  OWNER_EDITABLE_COLUMNS,
  setCompanyPendingChanges,
  validateCityBelongsToCountry,
  type OwnerEditableValues,
  type PendingChanges,
} from "@/data/companies";
import {
  describeCompanyIssue,
  editCompanySchema,
  type CompanyFormIssue,
  type EditCompanyInput,
} from "@/lib/company-form";
import { isProhibitedCategory } from "@/lib/prohibited-categories";
import { descriptionTranslationsFrom } from "./submit-company";

/**
 * The fields that change the live listing at once (ADR 0051): how to reach
 * the partner. Getting a phone number right should not wait for a moderator;
 * everything a member reads as the offer does.
 */
const IMMEDIATE: readonly (keyof PendingChanges)[] = [
  "website",
  "contactEmail",
  "contactPhone",
];

export type EditCompanyResult =
  | { success: true; outcome: "unchanged" | "applied" | "pending" }
  | { success: false; issue: CompanyFormIssue };

/** The form's values as the company's own columns and join rows. */
export function companyEditValues(data: EditCompanyInput): PendingChanges {
  const privileges = data.specialPrivileges === "true";
  const columns: OwnerEditableValues = {
    name: data.name,
    legalName: data.legalName || null,
    taxId: data.taxId,
    website: data.website || null,
    description: data.description,
    descriptionTranslations: descriptionTranslationsFrom(data),
    specializationDescription: data.specializationDescription,
    discount: data.discount,
    specialPrivileges: privileges,
    // The note belongs to the switch, as at application.
    specialPrivilegesNote: privileges
      ? data.specialPrivilegesNote?.trim() || null
      : null,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    country: data.registrationCountryCode,
    city: data.city || null,
    registrationCountryCode: data.registrationCountryCode,
    businessFormat: data.businessFormat,
    administrativeLevel1: data.administrativeLevel1 || null,
    administrativeLevel2: data.administrativeLevel2 || null,
    servesWorldwide: data.servesWorldwide === "true" ? 1 : 0,
    businessCategoryId: data.businessCategoryIds[0] ?? null,
  };
  return {
    ...columns,
    businessCategoryIds: data.businessCategoryIds,
    serviceCountryCodes: data.serviceCountryCodes.split(",").filter(Boolean),
  };
}

/** JSON with object keys sorted, so key order is not mistaken for a change. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : v,
  );
}

function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    Array.isArray(v)
      ? JSON.stringify((v as unknown[]).map(String).sort())
      : stableJson(v ?? null);
  return norm(a) === norm(b);
}

/**
 * A partner edits their own company (FR-045, ADR 0051).
 *
 * Like `submitCompany`, this authorises nothing: the caller has established
 * who the owner is, and the company is looked up by owner so another
 * partner's id finds nothing.
 *
 * A company still waiting for its first review is edited in place - the
 * moderator has not read it yet. An approved one keeps its live listing; the
 * difference waits in `pending_changes` - any edit already
 * waiting being replaced, except contacts and website, which apply at once.
 */
export async function editOwnCompany(
  db: DbClient,
  ownerId: string,
  formData: FormData,
): Promise<EditCompanyResult> {
  const parsed = editCompanySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { success: false, issue: describeCompanyIssue(parsed.error) };
  }
  const data = parsed.data;

  const company = await findOwnCompanyForEdit(db, data.companyId, ownerId);
  if (
    !company ||
    company.deletedAt ||
    (company.moderationStatus !== "pending" &&
      company.moderationStatus !== "approved")
  ) {
    return { success: false, issue: { code: "invalidField" } };
  }

  for (const id of data.businessCategoryIds) {
    const category = await findCategoryById(db, id);
    if (!category) {
      return {
        success: false,
        issue: { code: "categoryUnknown", field: "businessCategoryIds" },
      };
    }
    if (isProhibitedCategory(category)) {
      return {
        success: false,
        issue: { code: "categoryProhibited", field: "businessCategoryIds" },
      };
    }
  }
  if (
    !(await validateCityBelongsToCountry(
      db,
      data.city ?? "",
      data.registrationCountryCode,
    ))
  ) {
    return {
      success: false,
      issue: { code: "cityCountryMismatch", field: "city" },
    };
  }

  const proposed = companyEditValues(data);
  const live: PendingChanges = {
    ...Object.fromEntries(
      OWNER_EDITABLE_COLUMNS.map((column) => [column, company[column]]),
    ),
    businessCategoryIds: company.categories.map((c) => c.businessCategoryId),
    serviceCountryCodes: company.serviceCountries.map((c) => c.countryCode),
  };

  const changed = (Object.keys(proposed) as (keyof PendingChanges)[]).filter(
    (key) => !same(proposed[key], live[key]),
  );
  const pick = (keys: (keyof PendingChanges)[]): PendingChanges =>
    Object.fromEntries(keys.map((key) => [key, proposed[key]]));

  const audit = (applied: string[], pending: string[]) =>
    appendAuditEntry(db, {
      actorType: "member",
      actorId: ownerId,
      action: "company.owner_edited",
      subjectType: "company",
      subjectId: company.id,
      meta: { applied, pending },
    });

  if (company.moderationStatus === "pending") {
    if (changed.length === 0) return { success: true, outcome: "unchanged" };
    await applyOwnerEdit(db, company.id, pick(changed), {
      clearPending: false,
    });
    await audit(changed, []);
    return { success: true, outcome: "applied" };
  }

  const immediate = changed.filter((key) => IMMEDIATE.includes(key));
  const moderated = changed.filter((key) => !IMMEDIATE.includes(key));

  // The form always posts the whole company, so the latest edit is the whole
  // wish: what waits is exactly what still differs from the live listing.
  // An earlier waiting edit is replaced, and a field put back is dropped.
  const nextPending = pick(moderated);

  if (immediate.length > 0) {
    await applyOwnerEdit(db, company.id, pick(immediate), {
      clearPending: false,
    });
  }
  const pendingChanged =
    stableJson(nextPending) !== stableJson(company.pendingChanges ?? {});
  if (pendingChanged) {
    await setCompanyPendingChanges(
      db,
      company.id,
      Object.keys(nextPending).length > 0 ? nextPending : null,
    );
  }

  if (immediate.length === 0 && moderated.length === 0 && !pendingChanged) {
    return { success: true, outcome: "unchanged" };
  }
  await audit(immediate, moderated);
  return {
    success: true,
    outcome: Object.keys(nextPending).length > 0 ? "pending" : "applied",
  };
}
