import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import {
  createBusinessCategory,
  createCity,
  createCountry,
  findCompanyById,
  listCompaniesByOwner,
} from "@/data/companies.js";
import {
  upsertCompanyDraft,
  findCompanyDraftByOwner,
} from "@/data/company-drafts.js";
import { listSubscriptionsByCompanyId } from "@/data/billing.js";
import { members } from "@/data/schema/index.js";
import { submitCompany } from "@/modules/catalogue/submit-company.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-109, FR-111: what one submit of the partner application actually writes.
 *
 * `submitCompany` is the half of the application that both entry points share
 * — the public one-page form, which has just created the account, and the
 * dashboard form, whose owner is already signed in. These are the guarantees
 * the rest of the funnel rests on: the application lands as `pending` and
 * unpaid, it is owned by the member it was filed for and by nobody else, a
 * refusal writes nothing, and the draft it came from is gone.
 *
 * Deliberately not covered here: the account half. Creating a member needs
 * Next's request scope for cookies and headers, so it is not reachable from a
 * test that has no request around it.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

let seq = 0;

async function seedApplicant(db: DbClient, duesKind: "paying" | "partner") {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15558${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Partner Applicant",
      country: "UA",
      language: "en",
      role: "member",
      status: "active",
      duesKind,
    })
    .returning();

  return member!;
}

/**
 * Reference data is seeded by migration, so real ISO codes and real city names
 * are already taken. These use the ISO 3166 user-assigned range, which no seed
 * will ever claim.
 */
const COUNTRY = { code: "QX", name: "Applicantland" };
const CITY = "Applicantville";
/** A second country, so a city can belong to the wrong one. */
const ELSEWHERE = { code: "QY", name: "Elsewhereland" };
const ELSEWHERE_CITY = "Elsewhereville";

async function seedReferenceData(db: DbClient) {
  await createCountry(db, COUNTRY).catch(() => undefined);
  await createCountry(db, ELSEWHERE).catch(() => undefined);
  await createCity(db, { countryCode: COUNTRY.code, name: CITY }).catch(
    () => undefined,
  );
  await createCity(db, {
    countryCode: ELSEWHERE.code,
    name: ELSEWHERE_CITY,
  }).catch(() => undefined);
}

async function seedCategory(db: DbClient, subcategory?: string) {
  seq += 1;
  return createBusinessCategory(db, {
    block: "Services",
    category: "Food and drink",
    subcategory:
      subcategory ??
      `Coffee roasting ${seq}-${crypto.randomUUID().slice(0, 6)}`,
  });
}

function application(
  categoryIds: number[],
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    name: `Applicant ${crypto.randomUUID().slice(0, 8)}`,
    specializationDescription: "Roasting, tasting and wholesale supply.",
    description: "A coffee roastery.",
    discount: "15% for KCLUB members",
    businessCategoryIds: categoryIds.join(","),
    registrationCountryCode: COUNTRY.code,
    serviceCountryCodes: COUNTRY.code,
    servesWorldwide: "false",
    businessFormat: "offline_only",
    city: CITY,
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("FR-109: one submit files an application owned by the applicant", () => {
  it("creates a pending company owned by the member it was filed for", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db);

    const result = await submitCompany(
      db,
      applicant.id,
      application([category.id]),
    );

    expect(result.success).toBe(true);
    expect(result.companyId).toBeTruthy();

    const company = await findCompanyById(db, result.companyId!);
    expect(company?.ownerId).toBe(applicant.id);
    expect(company?.moderationStatus).toBe("pending");
  });

  it("files nothing under another member, even for an identical submission", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const mine = await seedApplicant(db, "partner");
    const theirs = await seedApplicant(db, "partner");
    const category = await seedCategory(db);

    await submitCompany(db, mine.id, application([category.id]));

    expect(await listCompaniesByOwner(db, theirs.id)).toHaveLength(0);
  });

  it("clears the draft the application came from", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db);

    await upsertCompanyDraft(db, applicant.id, { name: "Half typed" });
    expect(await findCompanyDraftByOwner(db, applicant.id)).not.toBeNull();

    await submitCompany(db, applicant.id, application([category.id]));

    expect(await findCompanyDraftByOwner(db, applicant.id)).toBeNull();
  });

  it("works the same for a member who already belongs to the club", async () => {
    // The dashboard form and the public one reach the same function; nothing
    // about the applicant's dues kind changes what is written.
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "paying");
    const category = await seedCategory(db);

    const result = await submitCompany(
      db,
      applicant.id,
      application([category.id]),
    );

    expect(result.success).toBe(true);
    const company = await findCompanyById(db, result.companyId!);
    expect(company?.ownerId).toBe(applicant.id);
  });

  it("gives a second company with the same name a slug of its own", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db);
    const name = `Twice ${crypto.randomUUID().slice(0, 8)}`;

    const first = await submitCompany(
      db,
      applicant.id,
      application([category.id], { name }),
    );
    const second = await submitCompany(
      db,
      applicant.id,
      application([category.id], { name }),
    );

    expect(first.success && second.success).toBe(true);
    const a = await findCompanyById(db, first.companyId!);
    const b = await findCompanyById(db, second.companyId!);
    expect(a?.slug).not.toBe(b?.slug);
  });
});

describe("FR-041, FR-109: a refused application writes nothing", () => {
  it("refuses a known city that belongs to another country, and creates no company", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db);

    const result = await submitCompany(
      db,
      applicant.id,
      // A city we know about, registered against the wrong country (FR-041).
      application([category.id], { city: ELSEWHERE_CITY }),
    );

    expect(result.success).toBe(false);
    expect(result.issue).toEqual({
      code: "cityCountryMismatch",
      field: "city",
    });
    expect(await listCompaniesByOwner(db, applicant.id)).toHaveLength(0);
  });

  it("refuses a category that does not exist", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");

    const result = await submitCompany(
      db,
      applicant.id,
      application([987654321]),
    );

    expect(result.issue?.code).toBe("categoryUnknown");
    expect(await listCompaniesByOwner(db, applicant.id)).toHaveLength(0);
  });

  it("refuses a prohibited category (Terms §15), and creates no company", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db, `Casino ${seq}-gambling`);

    const result = await submitCompany(
      db,
      applicant.id,
      application([category.id]),
    );

    expect(result.issue?.code).toBe("categoryProhibited");
    expect(await listCompaniesByOwner(db, applicant.id)).toHaveLength(0);
  });

  it("refuses a submission missing a required answer, and creates no company", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db);

    const result = await submitCompany(
      db,
      applicant.id,
      application([category.id], { specializationDescription: "" }),
    );

    expect(result.success).toBe(false);
    expect(result.issue?.field).toBe("specializationDescription");
    expect(await listCompaniesByOwner(db, applicant.id)).toHaveLength(0);
  });
});

describe("FR-111: a filed application is unpaid and carries no subscription", () => {
  it("attaches no subscription to a company that has just been filed", async () => {
    const db = testDbClient();
    await seedReferenceData(db);
    const applicant = await seedApplicant(db, "partner");
    const category = await seedCategory(db);

    const result = await submitCompany(
      db,
      applicant.id,
      application([category.id]),
    );

    // Nothing here reaches Stripe, and nothing may: the listing becomes
    // payable when a moderator approves it and not before (ADR 0036).
    const company = await findCompanyById(db, result.companyId!);
    expect(company?.moderationStatus).toBe("pending");
    expect(await listSubscriptionsByCompanyId(db, result.companyId!)).toEqual(
      [],
    );
  });
});
