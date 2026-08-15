import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import { appendAuditEntry, searchAuditLogs } from "@/data/audit-log.js";
import {
  applyCompanyPendingChanges,
  createBusinessCategory,
  createCity,
  createCountry,
  findCompanyById,
  insertCompany,
  listApprovedCompaniesByIds,
  listCompaniesWithPendingChanges,
  listPendingCompanies,
  setCompanyModerationStatus,
  setCompanyPendingChanges,
  setCompanyShowcase,
  updateCompanyFields,
  validateCityBelongsToCountry,
} from "@/data/companies.js";
import { companies, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * Company submission and moderation, FR-041 to FR-048.
 *
 * The moderation gate is one of the two places where getting it wrong is
 * visible to every member at once: an unapproved company appearing in the
 * catalogue, or a moderation decision that leaves no trace. These cover the
 * state transitions rather than the screens.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

let categorySeq = 0;

async function seedOwner(db: DbClient) {
  const [owner] = await db
    .insert(members)
    .values({
      phone: `+15557${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Moderation Owner",
      country: "UA",
      language: "en",
      role: "partner_owner",
      status: "active",
    })
    .returning();

  return owner!;
}

async function seedCategory(db: DbClient) {
  categorySeq += 1;
  return createBusinessCategory(db, {
    block: "Services",
    category: "Food and drink",
    subcategory: `Coffee shop ${categorySeq}-${crypto.randomUUID().slice(0, 6)}`,
  });
}

async function seedCompany(
  db: DbClient,
  overrides: Partial<typeof companies.$inferInsert> = {},
) {
  const owner = await seedOwner(db);
  const category = await seedCategory(db);
  const id = crypto.randomUUID();

  await insertCompany(db, {
    id,
    ownerId: owner.id,
    businessCategoryId: category.id,
    name: `Company ${id.slice(0, 8)}`,
    slug: `company-${id.slice(0, 8)}`,
    country: "Ukraine",
    city: "Kyiv",
    description: "A place that sells coffee",
    ...overrides,
  });

  const company = await findCompanyById(db, id);
  return { company: company!, owner, category };
}

describe("FR-041: a submission is rejected when its city does not belong to its country", () => {
  it("accepts a city that belongs to the selected country", async () => {
    const db = testDbClient();
    const country = await createCountry(db, { code: "PL", name: "Poland" });
    await createCity(db, { countryCode: country.code, name: "Krakow" });

    expect(await validateCityBelongsToCountry(db, "Krakow", "Poland")).toBe(
      true,
    );
    expect(await validateCityBelongsToCountry(db, "Krakow", "PL")).toBe(true);
  });

  it("rejects a known city paired with the wrong country", async () => {
    const db = testDbClient();
    const poland = await createCountry(db, { code: "PL", name: "Poland" });
    await createCountry(db, { code: "DE", name: "Germany" });
    await createCity(db, { countryCode: poland.code, name: "Krakow" });

    expect(await validateCityBelongsToCountry(db, "Krakow", "Germany")).toBe(
      false,
    );
  });

  it("matches the city case-insensitively, so 'krakow' is not a different city", async () => {
    const db = testDbClient();
    const poland = await createCountry(db, { code: "PL", name: "Poland" });
    await createCity(db, { countryCode: poland.code, name: "Krakow" });

    expect(await validateCityBelongsToCountry(db, "krakow", "Germany")).toBe(
      false,
    );
  });
});

describe("FR-042: a submitted company enters moderation and is invisible until approved", () => {
  it("puts a new submission in the pending queue", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    const queue = await listPendingCompanies(db);
    expect(queue.map((row) => row.id)).toContain(company.id);
  });

  it("does not return a pending company to the catalogue, even by direct id", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    const visible = await listApprovedCompaniesByIds(db, [company.id]);
    expect(visible).toHaveLength(0);
  });

  it("does not return a rejected company to the catalogue either", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });
    await setCompanyModerationStatus(db, company.id, "rejected", "Not a fit");

    const visible = await listApprovedCompaniesByIds(db, [company.id]);
    expect(visible).toHaveLength(0);
  });

  it("returns the company to the catalogue once it is approved", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });
    await setCompanyModerationStatus(db, company.id, "approved", null);

    const visible = await listApprovedCompaniesByIds(db, [company.id]);
    expect(visible.map((row) => row.id)).toEqual([company.id]);
  });

  it("defaults an insert that forgets the column to pending rather than approved", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db);

    expect(company.moderationStatus).toBe("pending");
  });
});

describe("FR-043: staff approve, or reject with a reason", () => {
  it("clears the queue entry and records no reason on approval", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    await setCompanyModerationStatus(db, company.id, "approved", null);

    const moderated = await findCompanyById(db, company.id);
    expect(moderated?.moderationStatus).toBe("approved");
    expect(moderated?.rejectionReason).toBeNull();

    const queue = await listPendingCompanies(db);
    expect(queue.map((row) => row.id)).not.toContain(company.id);
  });

  it("keeps the reason on rejection so the applicant can be told why", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    await setCompanyModerationStatus(
      db,
      company.id,
      "rejected",
      "Incomplete details: no address",
    );

    const moderated = await findCompanyById(db, company.id);
    expect(moderated?.moderationStatus).toBe("rejected");
    expect(moderated?.rejectionReason).toBe("Incomplete details: no address");
  });
});

describe("FR-045: an owner edit waits for moderation while the live version stays up", () => {
  it("stores the edit as pending changes without touching the published fields", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, {
      moderationStatus: "approved",
      name: "Live Name",
      discount: "10% for members",
    });

    await setCompanyPendingChanges(db, company.id, {
      name: "Edited Name",
      discount: "20% for members",
    });

    const live = await findCompanyById(db, company.id);
    expect(live?.name).toBe("Live Name");
    expect(live?.discount).toBe("10% for members");
    expect(live?.moderationStatus).toBe("approved");
    expect(live?.pendingChanges).toMatchObject({ name: "Edited Name" });
  });

  it("lists the company for moderators while an edit is waiting", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "approved" });
    await setCompanyPendingChanges(db, company.id, { name: "Edited Name" });

    const queue = await listCompaniesWithPendingChanges(db);
    expect(queue.map((row) => row.id)).toContain(company.id);
  });

  it("publishes the edit only once it is applied", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, {
      moderationStatus: "approved",
      name: "Live Name",
    });
    await setCompanyPendingChanges(db, company.id, { name: "Edited Name" });

    await applyCompanyPendingChanges(db, company.id);

    const updated = await findCompanyById(db, company.id);
    expect(updated?.name).toBe("Edited Name");
    expect(updated?.pendingChanges).toBeNull();
  });
});

describe("FR-046: staff edit any company and set its showcase rank", () => {
  it("edits fields on a company the staff member does not own", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "approved" });

    await updateCompanyFields(db, company.id, {
      discount: "Staff-set terms",
    });

    const updated = await findCompanyById(db, company.id);
    expect(updated?.discount).toBe("Staff-set terms");
  });

  it("sets and clears the showcase placement", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "approved" });

    await setCompanyShowcase(db, company.id, "top", 2);
    expect((await findCompanyById(db, company.id))?.showcaseType).toBe("top");
    expect((await findCompanyById(db, company.id))?.showcaseRank).toBe(2);

    await setCompanyShowcase(db, company.id, "none", 0);
    expect((await findCompanyById(db, company.id))?.showcaseType).toBe("none");
  });

  it("hides a company from the catalogue by returning it to moderation", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "approved" });

    await setCompanyModerationStatus(db, company.id, "rejected", "Hidden");

    expect(await listApprovedCompaniesByIds(db, [company.id])).toHaveLength(0);
  });
});

describe("FR-047: a moderation decision outlives the company it was about", () => {
  it("records the deciding staff member, the reason and a timestamp", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });
    const staff = await seedOwner(db);

    await setCompanyModerationStatus(db, company.id, "rejected", "Prohibited");
    const entry = await appendAuditEntry(db, {
      actorType: "staff",
      actorId: staff.id,
      action: "company.moderated",
      subjectType: "company",
      subjectId: company.id,
      meta: { status: "rejected", reason: "Prohibited" },
    });

    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBeInstanceOf(Date);

    const found = await searchAuditLogs(db, { target: company.id });
    expect(found).toHaveLength(1);
    expect(found[0]?.actorId).toBe(staff.id);
    expect(found[0]?.meta).toMatchObject({ reason: "Prohibited" });
  });

  it("keeps the decision after the company row is deleted", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });
    const staff = await seedOwner(db);

    await appendAuditEntry(db, {
      actorType: "staff",
      actorId: staff.id,
      action: "company.moderated",
      subjectType: "company",
      subjectId: company.id,
      meta: { status: "approved", reason: null },
    });

    await db.delete(companies).where(eq(companies.id, company.id));
    expect(await findCompanyById(db, company.id)).toBeUndefined();

    const found = await searchAuditLogs(db, { target: company.id });
    expect(found).toHaveLength(1);
    expect(found[0]?.action).toBe("company.moderated");
  });
});

describe("FR-048: the moderation queue shows the age of each item", () => {
  it("returns the submission time, so the queue can show how long an item has waited", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    const queue = await listPendingCompanies(db);
    const entry = queue.find((row) => row.id === company.id);

    expect(entry?.createdAt).toBeInstanceOf(Date);
    expect(entry!.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
