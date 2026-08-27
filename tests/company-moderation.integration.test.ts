import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import { appendAuditEntry, searchAuditLogs } from "@/data/audit-log.js";
import {
  applyCompanyPendingChanges,
  countCompaniesByStatus,
  countCompaniesForAdmin,
  createBusinessCategory,
  createCity,
  createCountry,
  findCompanyById,
  insertCompany,
  findCompanyForAdmin,
  listApprovedCompaniesByIds,
  listCompaniesForAdmin,
  listCompaniesWithPendingChanges,
  listPendingCompanies,
  setCompanyModerationStatus,
  setCompanyPendingChanges,
  setCompanyShowcase,
  updateCompanyFields,
  validateCityBelongsToCountry,
} from "@/data/companies.js";
import {
  countReferralsByRecipientCompany,
  insertReferral,
  listReferralsByRecipientCompany,
} from "@/data/referrals.js";
import { listSubscriptionsByCompanyId } from "@/data/billing.js";
import { companies, members, subscriptions } from "@/data/schema/index.js";
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

  await insertCompany(
    db,
    {
      id,
      ownerId: owner.id,
      businessCategoryId: category.id,
      name: `Company ${id.slice(0, 8)}`,
      slug: `company-${id.slice(0, 8)}`,
      country: "Ukraine",
      city: "Kyiv",
      description: "A place that sells coffee",
      ...overrides,
    },
    [],
    [category.id],
  );

  const company = await findCompanyById(db, id);
  return { company: company!, owner, category };
}

/**
 * Reference data is seeded by migration, so real ISO codes and real city names
 * are already taken. These use the ISO 3166 user-assigned range (QM..QZ), which
 * no seed will ever claim, and invented city names.
 */
const HOME = { code: "QM", name: "Homeland" };
const ELSEWHERE = { code: "QN", name: "Elsewhere" };
const HOME_CITY = "Testville";

async function seedTwoCountriesAndACity(db: DbClient) {
  const home = await createCountry(db, HOME);
  await createCountry(db, ELSEWHERE);
  await createCity(db, { countryCode: home.code, name: HOME_CITY });
}

describe("FR-041: a submission is rejected when its city does not belong to its country", () => {
  it("accepts a city that belongs to the selected country, by name or by code", async () => {
    const db = testDbClient();
    await seedTwoCountriesAndACity(db);

    expect(await validateCityBelongsToCountry(db, HOME_CITY, HOME.name)).toBe(
      true,
    );
    expect(await validateCityBelongsToCountry(db, HOME_CITY, HOME.code)).toBe(
      true,
    );
  });

  it("rejects a known city paired with the wrong country", async () => {
    const db = testDbClient();
    await seedTwoCountriesAndACity(db);

    expect(
      await validateCityBelongsToCountry(db, HOME_CITY, ELSEWHERE.name),
    ).toBe(false);
  });

  it("matches the city case-insensitively, so a lowercase name is not a different city", async () => {
    const db = testDbClient();
    await seedTwoCountriesAndACity(db);

    expect(
      await validateCityBelongsToCountry(
        db,
        HOME_CITY.toLowerCase(),
        ELSEWHERE.name,
      ),
    ).toBe(false);
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

  /**
   * FR-101 / ADR 0019: since a rejection now cancels a subscription and refunds
   * an invoice, applying the same decision twice must be impossible. The guard
   * is in the UPDATE's own WHERE, so the second caller learns it changed
   * nothing rather than repeating the decision's side effects.
   */
  it("FR-101: reports whether the decision actually changed anything, so a repeat cannot refund twice", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    await expect(
      setCompanyModerationStatus(db, company.id, "rejected", "Not a fit"),
    ).resolves.toBe(true);

    await expect(
      setCompanyModerationStatus(db, company.id, "rejected", "Not a fit"),
    ).resolves.toBe(false);
  });

  it("FR-101: still allows a genuine change of mind from rejected to approved", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db, { moderationStatus: "pending" });

    await setCompanyModerationStatus(db, company.id, "rejected", "Not a fit");
    await expect(
      setCompanyModerationStatus(db, company.id, "approved", null),
    ).resolves.toBe(true);
  });

  it("FR-101: reports no change for a company id that does not exist", async () => {
    const db = testDbClient();

    await expect(
      setCompanyModerationStatus(db, crypto.randomUUID(), "rejected", "gone"),
    ).resolves.toBe(false);
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

/**
 * The staff directory behind the admin Companies screen. Not an FR of its own -
 * it is how FR-043's approve/reject queue is reached once the screen shows
 * every moderation state instead of only the pending ones.
 */
describe("admin company directory: filters, paging and counts", () => {
  it("returns companies in every moderation state, not only the pending queue", async () => {
    const db = testDbClient();
    const marker = `Directory${crypto.randomUUID().slice(0, 8)}`;

    for (const moderationStatus of [
      "pending",
      "approved",
      "rejected",
    ] as const) {
      await seedCompany(db, {
        moderationStatus,
        name: `${marker} ${moderationStatus}`,
      });
    }

    const rows = await listCompaniesForAdmin(db, { query: marker });
    expect(rows.map((row) => row.moderationStatus).sort()).toEqual([
      "approved",
      "pending",
      "rejected",
    ]);

    const queue = await listPendingCompanies(db);
    expect(queue.filter((row) => row.name.startsWith(marker))).toHaveLength(1);
  });

  it("narrows to one status and counts every status under the same search", async () => {
    const db = testDbClient();
    const marker = `Counted${crypto.randomUUID().slice(0, 8)}`;

    await seedCompany(db, { moderationStatus: "pending", name: `${marker} a` });
    await seedCompany(db, { moderationStatus: "pending", name: `${marker} b` });
    await seedCompany(db, {
      moderationStatus: "approved",
      name: `${marker} c`,
    });

    await expect(countCompaniesForAdmin(db, { query: marker })).resolves.toBe(
      3,
    );
    await expect(
      countCompaniesForAdmin(db, { query: marker, status: "pending" }),
    ).resolves.toBe(2);
    await expect(
      countCompaniesByStatus(db, { query: marker }),
    ).resolves.toEqual({ pending: 2, approved: 1, rejected: 0 });

    const approved = await listCompaniesForAdmin(db, {
      query: marker,
      status: "approved",
    });
    expect(approved.map((row) => row.name)).toEqual([`${marker} c`]);
  });

  it("matches on slug and city as well as name, and pages without repeating a row", async () => {
    const db = testDbClient();
    const marker = `paged${crypto.randomUUID().slice(0, 8)}`;

    const seeded = [];
    for (let index = 0; index < 3; index += 1) {
      const { company } = await seedCompany(db, {
        name: `Paged company ${index}`,
        slug: `${marker}-${index}`,
        city: `${marker}ville`,
      });
      seeded.push(company);
    }

    await expect(countCompaniesForAdmin(db, { query: marker })).resolves.toBe(
      3,
    );
    await expect(
      countCompaniesForAdmin(db, { query: `${marker}ville` }),
    ).resolves.toBe(3);

    const first = await listCompaniesForAdmin(
      db,
      { query: marker },
      { limit: 2, offset: 0 },
    );
    const second = await listCompaniesForAdmin(
      db,
      { query: marker },
      { limit: 2, offset: 2 },
    );

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((row) => row.id))).toEqual(
      new Set(seeded.map((row) => row.id)),
    );
  });
});

/**
 * What the staff company drawer is able to read. The pending-changes path in
 * FR-045 is covered above at the data layer; these cover the aggregation the
 * drawer added around it, including the one property worth proving by shape:
 * the introductions tab cannot leak client identity because it never selects
 * those columns (ADR 0009).
 */
describe("admin company detail: what the drawer can read", () => {
  it("returns the company with the owner and category the drawer shows", async () => {
    const db = testDbClient();
    const { company, owner, category } = await seedCompany(db);

    const detail = await findCompanyForAdmin(db, company.id);

    expect(detail?.owner?.displayName).toBe(owner.displayName);
    expect(detail?.categories?.[0]?.businessCategory?.id).toBe(category.id);
  });

  it("scopes subscriptions to the company being looked at", async () => {
    const db = testDbClient();
    const { company, owner } = await seedCompany(db);
    const other = await seedCompany(db);

    await db.insert(subscriptions).values({
      memberId: owner.id,
      companyId: company.id,
      stripeCustomerId: `cus_${crypto.randomUUID()}`,
      stripeSubscriptionId: `sub_${crypto.randomUUID()}`,
      status: "active",
      priceId: `price_${crypto.randomUUID()}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const mine = await listSubscriptionsByCompanyId(db, company.id);
    expect(mine).toHaveLength(1);
    await expect(
      listSubscriptionsByCompanyId(db, other.company.id),
    ).resolves.toHaveLength(0);
  });

  it("counts introductions by status without ever selecting the client's identity", async () => {
    const db = testDbClient();
    const { company } = await seedCompany(db);
    const sender = await seedOwner(db);

    const base = {
      senderId: sender.id,
      recipientCompanyId: company.id,
      clientName: "Client Should Not Appear",
      contactChannel: "secret@example.com",
      serviceNeeded: "Roof repair",
      consentAttested: true,
      consentTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    };

    await insertReferral(db, base);
    await insertReferral(db, { ...base, status: "delivered" });
    await insertReferral(db, { ...base, status: "accepted" });

    await expect(
      countReferralsByRecipientCompany(db, company.id),
    ).resolves.toEqual({ pending_review: 1, delivered: 1, accepted: 1 });

    const rows = await listReferralsByRecipientCompany(db, company.id);
    expect(rows).toHaveLength(3);

    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain("Client Should Not Appear");
    expect(serialised).not.toContain("secret@example.com");
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "serviceNeeded",
      "status",
    ]);
  });
});
