import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import {
  createBusinessCategory,
  findApprovedCompanyBySlug,
  insertCompany,
  listApprovedCompaniesByIds,
  listShowcaseCompanies,
} from "@/data/companies.js";
import { companies, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * The catalogue, FR-030 to FR-035.
 *
 * Everything here goes through `listApprovedCompaniesByIds`, which takes the
 * ids of companies with an active listing subscription and applies the member's
 * filters. The two gates it must never lose are moderation status and that id
 * list - a company that is unapproved, or unpaid, is not in the catalogue no
 * matter what is asked for.
 *
 * FR-032 (search ranked by relevance) and FR-036 (400 ms p95) are deliberately
 * not claimed here. Search is currently an unranked ILIKE rather than the
 * full-text search ADR 0006 specifies, and a latency target is a measurement,
 * not an assertion.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

let seq = 0;

async function seedOwner(db: DbClient) {
  const [owner] = await db
    .insert(members)
    .values({
      phone: `+15556${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Catalogue Owner",
      country: "UA",
      language: "en",
      role: "partner_owner",
      status: "active",
    })
    .returning();

  return owner!;
}

async function seedCategory(
  db: DbClient,
  block = "Services",
  category = "Food and drink",
) {
  seq += 1;
  return createBusinessCategory(db, {
    block,
    category,
    subcategory: `Sub ${seq}-${crypto.randomUUID().slice(0, 6)}`,
  });
}

async function seedPartner(
  db: DbClient,
  overrides: Partial<typeof companies.$inferInsert> & {
    categoryId?: number;
  } = {},
) {
  const owner = await seedOwner(db);
  const { categoryId, ...rest } = overrides;
  const category = categoryId ? null : await seedCategory(db);
  const id = crypto.randomUUID();

  await insertCompany(db, {
    id,
    ownerId: owner.id,
    businessCategoryId: categoryId ?? category!.id,
    name: `Partner ${id.slice(0, 8)}`,
    slug: `partner-${id.slice(0, 8)}`,
    country: "Ukraine",
    city: "Kyiv",
    description: "Speciality coffee and pastries",
    discount: "15% for members",
    contactEmail: "hello@example.com",
    contactPhone: "+380991234567",
    moderationStatus: "approved",
    ...rest,
  });

  return id;
}

describe("FR-030: the catalogue is a members-only view", () => {
  it("returns nothing when no company has an active listing subscription", async () => {
    const db = testDbClient();
    await seedPartner(db);

    // The action passes the ids of paid listings; an empty set is the shape it
    // hands over when nobody is paying.
    expect(await listApprovedCompaniesByIds(db, [])).toHaveLength(0);
  });

  it("never returns an unapproved company, even when its id is asked for", async () => {
    const db = testDbClient();
    const pending = await seedPartner(db, { moderationStatus: "pending" });
    const approved = await seedPartner(db);

    const visible = await listApprovedCompaniesByIds(db, [pending, approved]);

    expect(visible.map((row) => row.id)).toEqual([approved]);
  });
});

describe("FR-031: filter the catalogue by category, country and city", () => {
  it("filters by category", async () => {
    const db = testDbClient();
    const wanted = await seedCategory(db);
    const other = await seedCategory(db);
    const inCategory = await seedPartner(db, { categoryId: wanted.id });
    const outside = await seedPartner(db, { categoryId: other.id });

    const visible = await listApprovedCompaniesByIds(
      db,
      [inCategory, outside],
      { categoryId: wanted.id },
    );

    expect(visible.map((row) => row.id)).toEqual([inCategory]);
  });

  it("filters by the wider category block", async () => {
    const db = testDbClient();
    const wellness = await seedCategory(db, "Wellness", "Fitness");
    const services = await seedCategory(db, "Services", "Food and drink");
    const inBlock = await seedPartner(db, { categoryId: wellness.id });
    const outside = await seedPartner(db, { categoryId: services.id });

    const visible = await listApprovedCompaniesByIds(db, [inBlock, outside], {
      block: "Wellness",
    });

    expect(visible.map((row) => row.id)).toEqual([inBlock]);
  });

  it("filters by country and by city, case-insensitively", async () => {
    const db = testDbClient();
    const kyiv = await seedPartner(db, { country: "Ukraine", city: "Kyiv" });
    const lviv = await seedPartner(db, { country: "Ukraine", city: "Lviv" });
    const warsaw = await seedPartner(db, { country: "Poland", city: "Warsaw" });
    const all = [kyiv, lviv, warsaw];

    expect(
      (await listApprovedCompaniesByIds(db, all, { country: "ukraine" }))
        .map((row) => row.id)
        .sort(),
    ).toEqual([kyiv, lviv].sort());

    expect(
      (await listApprovedCompaniesByIds(db, all, { city: "kyiv" })).map(
        (row) => row.id,
      ),
    ).toEqual([kyiv]);
  });

  it("combines filters rather than treating them as alternatives", async () => {
    const db = testDbClient();
    const category = await seedCategory(db);
    const match = await seedPartner(db, {
      categoryId: category.id,
      country: "Ukraine",
      city: "Kyiv",
    });
    const rightCategoryWrongCity = await seedPartner(db, {
      categoryId: category.id,
      country: "Ukraine",
      city: "Lviv",
    });
    const rightCityWrongCategory = await seedPartner(db, {
      country: "Ukraine",
      city: "Kyiv",
    });

    const visible = await listApprovedCompaniesByIds(
      db,
      [match, rightCategoryWrongCity, rightCityWrongCategory],
      { categoryId: category.id, country: "Ukraine", city: "Kyiv" },
    );

    expect(visible.map((row) => row.id)).toEqual([match]);
  });

  it("returns an empty page rather than everything when a filter matches nothing", async () => {
    const db = testDbClient();
    const partner = await seedPartner(db, { city: "Kyiv" });

    expect(
      await listApprovedCompaniesByIds(db, [partner], { city: "Atlantis" }),
    ).toHaveLength(0);
  });
});

describe("catalogue search: substring matching on name and description", () => {
  it("matches a partner name case-insensitively", async () => {
    const db = testDbClient();
    const target = await seedPartner(db, { name: "Blue Bottle Coffee" });
    const other = await seedPartner(db, { name: "Iron Gym" });

    const visible = await listApprovedCompaniesByIds(db, [target, other], {
      query: "blue bottle",
    });

    expect(visible.map((row) => row.id)).toEqual([target]);
  });

  it("matches text in the description, not only the name", async () => {
    const db = testDbClient();
    const target = await seedPartner(db, {
      name: "Anonymous Ltd",
      description: "Neapolitan pizza and natural wine",
    });
    const other = await seedPartner(db, {
      name: "Other Ltd",
      description: "Dry cleaning",
    });

    const visible = await listApprovedCompaniesByIds(db, [target, other], {
      query: "Neapolitan",
    });

    expect(visible.map((row) => row.id)).toEqual([target]);
  });

  it("matches Cyrillic text, so a Russian or Ukrainian listing is searchable", async () => {
    const db = testDbClient();
    const target = await seedPartner(db, {
      name: "Кав'ярня",
      description: "Спеціальна кава",
    });
    const other = await seedPartner(db, { name: "Barber" });

    const visible = await listApprovedCompaniesByIds(db, [target, other], {
      query: "кава",
    });

    expect(visible.map((row) => row.id)).toEqual([target]);
  });
});

describe("FR-033: a partner detail page carries what a member needs to use the discount", () => {
  it("returns the discount, category, location, contacts and description", async () => {
    const db = testDbClient();
    const id = await seedPartner(db, {
      slug: "detail-partner",
      name: "Detail Partner",
      discount: "20% on everything",
      description: "What we do",
      country: "Ukraine",
      city: "Kyiv",
      contactEmail: "hi@detail.example",
      contactPhone: "+380991112233",
    });

    const detail = await findApprovedCompanyBySlug(db, "detail-partner", [id]);

    expect(detail?.discount).toBe("20% on everything");
    expect(detail?.description).toBe("What we do");
    expect(detail?.country).toBe("Ukraine");
    expect(detail?.city).toBe("Kyiv");
    expect(detail?.contactEmail).toBe("hi@detail.example");
    expect(detail?.contactPhone).toBe("+380991112233");
    expect(detail?.businessCategory?.subcategory).toBeTruthy();
  });

  it("does not resolve the slug of a company that is not approved", async () => {
    const db = testDbClient();
    const id = await seedPartner(db, {
      slug: "unapproved-partner",
      moderationStatus: "pending",
    });

    expect(
      await findApprovedCompanyBySlug(db, "unapproved-partner", [id]),
    ).toBeUndefined();
  });

  it("does not resolve the slug of a company outside the paid id set", async () => {
    const db = testDbClient();
    await seedPartner(db, { slug: "unpaid-partner" });

    expect(await findApprovedCompanyBySlug(db, "unpaid-partner", [])).toBe(
      undefined,
    );
  });
});

describe("FR-034: the showcase holds at most three Top and three Featured", () => {
  it("caps each block at three even when more are ranked", async () => {
    const db = testDbClient();
    const ids: string[] = [];
    for (let rank = 1; rank <= 5; rank += 1) {
      ids.push(
        await seedPartner(db, { showcaseType: "top", showcaseRank: rank }),
      );
    }

    const top = await listShowcaseCompanies(db, ids, "top");
    expect(top).toHaveLength(3);
  });

  it("orders by the rank staff set, not by insertion", async () => {
    const db = testDbClient();
    const third = await seedPartner(db, {
      showcaseType: "top",
      showcaseRank: 3,
    });
    const first = await seedPartner(db, {
      showcaseType: "top",
      showcaseRank: 1,
    });
    const second = await seedPartner(db, {
      showcaseType: "top",
      showcaseRank: 2,
    });

    const top = await listShowcaseCompanies(db, [third, first, second], "top");

    expect(top.map((row) => row.id)).toEqual([first, second, third]);
  });

  it("keeps Top and Featured as separate blocks", async () => {
    const db = testDbClient();
    const top = await seedPartner(db, { showcaseType: "top", showcaseRank: 1 });
    const featured = await seedPartner(db, {
      showcaseType: "featured",
      showcaseRank: 1,
    });
    const ids = [top, featured];

    expect(
      (await listShowcaseCompanies(db, ids, "top")).map((row) => row.id),
    ).toEqual([top]);
    expect(
      (await listShowcaseCompanies(db, ids, "featured")).map((row) => row.id),
    ).toEqual([featured]);
  });

  it("excludes an unapproved company from the showcase", async () => {
    const db = testDbClient();
    const pending = await seedPartner(db, {
      showcaseType: "top",
      showcaseRank: 1,
      moderationStatus: "pending",
    });

    expect(await listShowcaseCompanies(db, [pending], "top")).toHaveLength(0);
  });
});

describe("FR-035: the public showcase is a curated subset, never the catalogue", () => {
  it("shows only companies staff placed in a block, not every approved partner", async () => {
    const db = testDbClient();
    const showcased = await seedPartner(db, {
      showcaseType: "top",
      showcaseRank: 1,
    });
    const ordinary = await seedPartner(db);
    const ids = [showcased, ordinary];

    const showcase = [
      ...(await listShowcaseCompanies(db, ids, "top")),
      ...(await listShowcaseCompanies(db, ids, "featured")),
    ];

    expect(showcase.map((row) => row.id)).toEqual([showcased]);
    expect(await listApprovedCompaniesByIds(db, ids)).toHaveLength(2);
  });

  it("is bounded at six entries in total, whatever the catalogue holds", async () => {
    const db = testDbClient();
    const ids: string[] = [];
    for (let rank = 1; rank <= 6; rank += 1) {
      ids.push(
        await seedPartner(db, { showcaseType: "top", showcaseRank: rank }),
      );
      ids.push(
        await seedPartner(db, { showcaseType: "featured", showcaseRank: rank }),
      );
    }

    const showcase = [
      ...(await listShowcaseCompanies(db, ids, "top")),
      ...(await listShowcaseCompanies(db, ids, "featured")),
    ];

    expect(showcase).toHaveLength(6);
    expect(await listApprovedCompaniesByIds(db, ids)).toHaveLength(12);
  });
});
