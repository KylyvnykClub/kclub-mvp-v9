import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import {
  applyCompanyPendingChanges,
  createBusinessCategory,
  findCompanyById,
  insertCompany,
} from "@/data/companies.js";
import {
  auditLog,
  companyCategories,
  companyServiceCountries,
  members,
} from "@/data/schema/index.js";
import { editOwnCompany } from "@/modules/catalogue/edit-company.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-045 / ADR 0051: a partner edits every field of their own company. On an
 * approved company the offer waits for a moderator while the live listing
 * stays up; contacts and the website change at once.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

let seq = 0;
async function seedOwner() {
  const [owner] = await db()
    .insert(members)
    .values({
      phone: `+15559${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Editing Owner",
      country: "UA",
      language: "uk",
      role: "member",
      status: "active",
    })
    .returning();
  return owner!.id;
}

async function seedCategory(subcategory = "Coffee shop") {
  seq += 1;
  return createBusinessCategory(db(), {
    block: "Services",
    category: "Food and drink",
    subcategory: `${subcategory} ${seq}-${crypto.randomUUID().slice(0, 6)}`,
  });
}

async function seedCompany(moderationStatus: "pending" | "approved") {
  const ownerId = await seedOwner();
  const category = await seedCategory();
  const id = crypto.randomUUID();
  await insertCompany(
    db(),
    {
      id,
      ownerId,
      businessCategoryId: category.id,
      name: "Live Name",
      slug: `edit-${id.slice(0, 8)}`,
      taxId: "12345678",
      description: "A place that sells good coffee to members.",
      specializationDescription: "Coffee",
      discount: "10% for members",
      contactEmail: "old@example.com",
      contactPhone: "+380501112233",
      country: "UA",
      registrationCountryCode: "UA",
      city: "Kyiv",
      businessFormat: "offline_only",
      moderationStatus,
    },
    ["UA"],
    [category.id],
  );
  return { ownerId, companyId: id, categoryId: category.id };
}

function form(
  companyId: string,
  categoryId: number,
  overrides: Record<string, string> = {},
): FormData {
  const values: Record<string, string> = {
    companyId,
    name: "Live Name",
    legalName: "",
    taxId: "12345678",
    website: "",
    description: "A place that sells good coffee to members.",
    descriptionEn: "",
    descriptionUk: "",
    descriptionRu: "",
    specializationDescription: "Coffee",
    discount: "10% for members",
    specialPrivileges: "false",
    specialPrivilegesNote: "",
    contactEmail: "old@example.com",
    contactPhone: "+380501112233",
    businessCategoryIds: String(categoryId),
    registrationCountryCode: "UA",
    serviceCountryCodes: "UA",
    servesWorldwide: "false",
    businessFormat: "offline_only",
    city: "Kyiv",
    administrativeLevel1: "",
    administrativeLevel2: "",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("FR-045: a partner edits their approved company", () => {
  it("FR-045: the offer waits for a moderator, contacts change at once", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("approved");

    const result = await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, {
        name: "New Name",
        discount: "20% for members",
        contactPhone: "+380509998877",
        website: "https://example.com",
      }),
    );

    expect(result).toEqual({ success: true, outcome: "pending" });
    const live = await findCompanyById(db(), companyId);
    expect(live?.name).toBe("Live Name");
    expect(live?.discount).toBe("10% for members");
    expect(live?.contactPhone).toBe("+380509998877");
    expect(live?.website).toBe("https://example.com");
    expect(live?.pendingChanges).toEqual({
      name: "New Name",
      discount: "20% for members",
    });
  });

  it("FR-045: approving applies every field, categories and service countries included", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("approved");
    const other = await seedCategory("Bakery");

    await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, {
        businessCategoryIds: `${other.id}`,
        serviceCountryCodes: "UA,PL",
        specialPrivileges: "true",
        specialPrivilegesNote: "Free dessert",
        descriptionEn: "Good coffee for members, in English.",
      }),
    );
    await applyCompanyPendingChanges(db(), companyId);

    const updated = await findCompanyById(db(), companyId);
    expect(updated?.pendingChanges).toBeNull();
    expect(updated?.specialPrivileges).toBe(true);
    expect(updated?.specialPrivilegesNote).toBe("Free dessert");
    expect(updated?.descriptionTranslations).toEqual({
      en: "Good coffee for members, in English.",
    });
    expect(updated?.businessCategoryId).toBe(other.id);
    const cats = await db()
      .select()
      .from(companyCategories)
      .where(eq(companyCategories.companyId, companyId));
    expect(cats.map((c) => c.businessCategoryId)).toEqual([other.id]);
    const countries = await db()
      .select()
      .from(companyServiceCountries)
      .where(eq(companyServiceCountries.companyId, companyId));
    expect(countries.map((c) => c.countryCode).sort()).toEqual(["PL", "UA"]);
  });

  it("FR-045: putting a field back drops it from what waits, and an unchanged form changes nothing", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("approved");
    await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, { discount: "20% for members" }),
    );

    expect(
      await editOwnCompany(db(), ownerId, form(companyId, categoryId)),
    ).toEqual({ success: true, outcome: "applied" });
    expect((await findCompanyById(db(), companyId))?.pendingChanges).toBeNull();

    expect(
      await editOwnCompany(db(), ownerId, form(companyId, categoryId)),
    ).toEqual({ success: true, outcome: "unchanged" });
  });

  it("FR-045: the edit is audited as the owner, naming what applied and what waits", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("approved");
    await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, {
        name: "New Name",
        contactEmail: "new@example.com",
      }),
    );

    const [entry] = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.subjectId, companyId));
    expect(entry?.action).toBe("company.owner_edited");
    expect(entry?.actorId).toBe(ownerId);
    expect(entry?.meta).toEqual({
      applied: ["contactEmail"],
      pending: ["name"],
    });
  });
});

describe("FR-045: what an edit may not do", () => {
  it("FR-045: an application not yet reviewed is edited in place", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("pending");
    const result = await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, { name: "Corrected Name" }),
    );
    expect(result).toEqual({ success: true, outcome: "applied" });
    const company = await findCompanyById(db(), companyId);
    expect(company?.name).toBe("Corrected Name");
    expect(company?.pendingChanges).toBeNull();
  });

  it("FR-045: another member's company is not found", async () => {
    const { companyId, categoryId } = await seedCompany("approved");
    const stranger = await seedOwner();
    const result = await editOwnCompany(
      db(),
      stranger,
      form(companyId, categoryId, { name: "Hijacked" }),
    );
    expect(result.success).toBe(false);
    expect((await findCompanyById(db(), companyId))?.pendingChanges).toBeNull();
  });

  it("FR-045: invalid input names the field and changes nothing", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("approved");
    const result = await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, { contactEmail: "not-an-email" }),
    );
    expect(result).toMatchObject({
      success: false,
      issue: { field: "contactEmail" },
    });
    expect((await findCompanyById(db(), companyId))?.contactEmail).toBe(
      "old@example.com",
    );
  });

  it("FR-041: a prohibited or unknown category is refused", async () => {
    const { ownerId, companyId, categoryId } = await seedCompany("approved");
    const result = await editOwnCompany(
      db(),
      ownerId,
      form(companyId, categoryId, { businessCategoryIds: "999999999" }),
    );
    expect(result).toMatchObject({
      success: false,
      issue: { code: "categoryUnknown" },
    });
  });
});
