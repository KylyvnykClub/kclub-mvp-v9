import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DbClient } from "@/data/db.js";
import { eraseMemberTx } from "@/data/account-erasure.js";
import {
  approvedReviewSummary,
  countReviewsByStatus,
  findOwnReview,
  listApprovedReviews,
  listReviewsForAdmin,
  moderateReview,
  upsertOwnReview,
  deleteOwnReview,
} from "@/data/company-reviews.js";
import { insertCompany, softDeleteCompany } from "@/data/companies.js";
import { companyReviews, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * ADR 0047: members review partners, anonymously, after moderation.
 * The actions' eligibility rule is `src/domain/reviews.test.ts`; this is the
 * storage half - what is stored, what the public read returns, and what the
 * erasure and the company deletion take away.
 */

function db(): DbClient {
  return getTestDb() as unknown as DbClient;
}

const NOW = new Date("2026-10-20T12:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

async function seedMember(name: string) {
  const [member] = await db()
    .insert(members)
    .values({
      phone: `+15557${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: name,
      country: "US",
      language: "en",
      role: "member",
      status: "active",
    })
    .returning();
  return member!.id;
}

async function seedCompany() {
  const ownerId = await seedMember("Partner Owner");
  const companyId = await insertCompany(db(), {
    ownerId,
    name: "Reviewed Co",
    slug: `reviewed-co-${crypto.randomUUID().slice(0, 8)}`,
    moderationStatus: "approved",
  });
  return { ownerId, companyId };
}

async function review(
  companyId: string,
  memberId: string,
  rating: number,
  body = "Excellent service, would come back.",
  at = NOW,
) {
  await upsertOwnReview(db(), {
    companyId,
    memberId,
    rating,
    body,
    locale: "en",
    now: at,
  });
  const [row] = await db()
    .select({ id: companyReviews.id })
    .from(companyReviews)
    .where(eq(companyReviews.memberId, memberId));
  return row!.id;
}

describe("FR-129: a review is published only once a moderator approves it", () => {
  it("FR-129: a new review is pending and invisible on the partner page", async () => {
    const { companyId } = await seedCompany();
    const author = await seedMember("Alice Reviewer");
    await review(companyId, author, 5);

    expect(await listApprovedReviews(db(), companyId)).toEqual([]);
    expect(await approvedReviewSummary(db(), companyId)).toEqual({
      count: 0,
      average: null,
    });
    expect((await findOwnReview(db(), companyId, author))?.status).toBe(
      "pending",
    );
  });

  it("FR-129: approving publishes it and the summary counts it; rejecting takes it down", async () => {
    const { companyId } = await seedCompany();
    const staff = await seedMember("Moderator");
    const first = await review(companyId, await seedMember("A"), 5);
    const second = await review(companyId, await seedMember("B"), 2);

    await moderateReview(db(), {
      reviewId: first,
      status: "approved",
      staffId: staff,
      now: NOW,
    });
    await moderateReview(db(), {
      reviewId: second,
      status: "approved",
      staffId: staff,
      now: NOW,
    });
    expect(await approvedReviewSummary(db(), companyId)).toEqual({
      count: 2,
      average: 3.5,
    });

    const result = await moderateReview(db(), {
      reviewId: second,
      status: "rejected",
      staffId: staff,
      now: NOW,
    });
    expect(result).toEqual({ companyId, previousStatus: "approved" });
    expect(
      (await listApprovedReviews(db(), companyId)).map((r) => r.id),
    ).toEqual([first]);
  });

  it("FR-129: moderating a review that does not exist changes nothing", async () => {
    expect(
      await moderateReview(db(), {
        reviewId: crypto.randomUUID(),
        status: "approved",
        staffId: await seedMember("Moderator"),
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("FR-127 / FR-128: one review per member per company, theirs to edit or withdraw", () => {
  it("FR-127: a second submission replaces the first and goes back to moderation", async () => {
    const { companyId } = await seedCompany();
    const author = await seedMember("Bob");
    const id = await review(companyId, author, 5);
    await moderateReview(db(), {
      reviewId: id,
      status: "approved",
      staffId: await seedMember("Moderator"),
      now: NOW,
    });

    const again = await review(
      companyId,
      author,
      1,
      "Changed my mind entirely.",
      later(5),
    );

    expect(again).toBe(id);
    expect(await findOwnReview(db(), companyId, author)).toEqual({
      rating: 1,
      body: "Changed my mind entirely.",
      status: "pending",
    });
    expect(await listApprovedReviews(db(), companyId)).toEqual([]);
  });

  it("FR-128: a member withdraws their own review and nobody else's", async () => {
    const { companyId } = await seedCompany();
    const author = await seedMember("Carol");
    const other = await seedMember("Dave");
    await review(companyId, author, 4);

    expect(await deleteOwnReview(db(), companyId, other)).toBe(false);
    expect(await deleteOwnReview(db(), companyId, author)).toBe(true);
    expect(await findOwnReview(db(), companyId, author)).toBeNull();
  });

  it("FR-127: the database refuses a rating outside 1..5", async () => {
    const { companyId } = await seedCompany();
    await expect(
      review(companyId, await seedMember("Eve"), 6),
    ).rejects.toThrow();
  });
});

describe("ADR 0005 / FR-130: nobody but staff learns who wrote a review", () => {
  it("FR-130: the public read carries no member id, name or phone", async () => {
    const { companyId } = await seedCompany();
    const author = await seedMember("Frank Secretname");
    const id = await review(companyId, author, 5);
    await moderateReview(db(), {
      reviewId: id,
      status: "approved",
      staffId: await seedMember("Moderator"),
      now: NOW,
    });

    const [published] = await listApprovedReviews(db(), companyId);
    expect(Object.keys(published!).sort()).toEqual(
      ["body", "createdAt", "id", "rating"].sort(),
    );
    expect(JSON.stringify(published)).not.toContain(author);
    expect(JSON.stringify(published)).not.toContain("Secretname");
  });

  it("FR-129: the staff queue does name the author", async () => {
    const { companyId } = await seedCompany();
    await review(companyId, await seedMember("Grace Author"), 3);

    const rows = await listReviewsForAdmin(
      db(),
      { status: "pending", query: "Reviewed Co" },
      { limit: 50, offset: 0 },
    );
    expect(rows.map((row) => row.authorName)).toContain("Grace Author");
    expect(
      (await countReviewsByStatus(db(), { query: "Reviewed Co" })).pending,
    ).toBeGreaterThan(0);
  });
});

describe("ADR 0047 retention: reviews leave with their author or their partner", () => {
  it("FR-009: erasing a member deletes the reviews they wrote and the ones of their companies", async () => {
    const { ownerId, companyId } = await seedCompany();
    const author = await seedMember("Heidi");
    const elsewhere = await seedCompany();
    await review(companyId, author, 5);
    await review(elsewhere.companyId, author, 4);
    await review(companyId, await seedMember("Ivan"), 3);

    await eraseMemberTx(db(), author, NOW);
    expect(
      await db()
        .select()
        .from(companyReviews)
        .where(eq(companyReviews.memberId, author)),
    ).toEqual([]);

    await eraseMemberTx(db(), ownerId, NOW);
    expect(
      await db()
        .select()
        .from(companyReviews)
        .where(eq(companyReviews.companyId, companyId)),
    ).toEqual([]);
  });

  it("FR-046: deleting a company deletes its reviews", async () => {
    const { companyId } = await seedCompany();
    await review(companyId, await seedMember("Judy"), 5);

    await softDeleteCompany(db(), companyId, "Closed", NOW);

    expect(
      await db()
        .select()
        .from(companyReviews)
        .where(eq(companyReviews.companyId, companyId)),
    ).toEqual([]);
  });
});
