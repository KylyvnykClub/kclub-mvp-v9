import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/data/db.js";
import {
  COMPANY_DRAFT_RETENTION_DAYS,
  deleteCompanyDraft,
  deleteExpiredCompanyDrafts,
  findCompanyDraftByOwner,
  upsertCompanyDraft,
} from "@/data/company-drafts.js";
import { companyDrafts, members } from "@/data/schema/index.js";
import { getTestDb } from "./setup/integration-setup.js";

/**
 * FR-040: the four-step company application saves a draft between steps.
 *
 * The wizard is only as good as what survives a refresh, so these cover the
 * storage guarantees: answers merge rather than replace, the resume point never
 * regresses, and the three deletion paths in data-storage.md §4 all work -
 * submission, retention sweep, and member deletion.
 */

function testDbClient(): DbClient {
  return getTestDb() as unknown as DbClient;
}

async function seedMember(db: DbClient) {
  const [member] = await db
    .insert(members)
    .values({
      phone: `+15559${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      displayName: "Draft Applicant",
      country: "UA",
      language: "en",
      role: "member",
      status: "active",
    })
    .returning();

  return member!;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe("FR-040: company application drafts", () => {
  it("stores a draft and reads it back for its owner", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 1, { name: "Acme Coffee" });

    const draft = await findCompanyDraftByOwner(db, member.id);
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe(1);
    expect(draft?.data).toEqual({ name: "Acme Coffee" });
  });

  it("returns null when the member has never started an application", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    expect(await findCompanyDraftByOwner(db, member.id)).toBeNull();
  });

  it("keeps one draft per member instead of accumulating half-finished ones", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 1, { name: "Acme Coffee" });
    await upsertCompanyDraft(db, member.id, 2, {
      name: "Acme Coffee",
      city: "Kyiv",
    });

    const rows = await db
      .select()
      .from(companyDrafts)
      .where(eq(companyDrafts.ownerId, member.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({ name: "Acme Coffee", city: "Kyiv" });
  });

  it("does not move the resume point backwards when an earlier step is corrected", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 3, { name: "Acme Coffee" });
    await upsertCompanyDraft(db, member.id, 1, { name: "Acme Coffee Ltd" });

    const draft = await findCompanyDraftByOwner(db, member.id);
    expect(draft?.step).toBe(3);
    expect(draft?.data).toEqual({ name: "Acme Coffee Ltd" });
  });

  it("does not let one member's draft be found by another", async () => {
    const db = testDbClient();
    const mine = await seedMember(db);
    const theirs = await seedMember(db);

    await upsertCompanyDraft(db, mine.id, 2, { name: "Mine" });

    expect(await findCompanyDraftByOwner(db, theirs.id)).toBeNull();
  });

  it("deletes the draft on submission", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 4, { name: "Acme Coffee" });
    await deleteCompanyDraft(db, member.id);

    expect(await findCompanyDraftByOwner(db, member.id)).toBeNull();
  });

  it("sweeps a draft abandoned for longer than the retention period", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 1, { name: "Abandoned" });
    await db
      .update(companyDrafts)
      .set({ updatedAt: daysAgo(COMPANY_DRAFT_RETENTION_DAYS + 1) })
      .where(eq(companyDrafts.ownerId, member.id));

    const deleted = await deleteExpiredCompanyDrafts(db, new Date());

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await findCompanyDraftByOwner(db, member.id)).toBeNull();
  });

  it("leaves a draft edited inside the retention window alone", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 1, { name: "Still working" });
    await db
      .update(companyDrafts)
      .set({ updatedAt: daysAgo(COMPANY_DRAFT_RETENTION_DAYS - 1) })
      .where(eq(companyDrafts.ownerId, member.id));

    await deleteExpiredCompanyDrafts(db, new Date());

    expect(await findCompanyDraftByOwner(db, member.id)).not.toBeNull();
  });

  it("takes the draft with the member when the member is deleted", async () => {
    const db = testDbClient();
    const member = await seedMember(db);

    await upsertCompanyDraft(db, member.id, 2, { name: "Leaving" });
    await db.delete(members).where(eq(members.id, member.id));

    const rows = await db
      .select()
      .from(companyDrafts)
      .where(eq(companyDrafts.ownerId, member.id));

    expect(rows).toHaveLength(0);
  });
});
