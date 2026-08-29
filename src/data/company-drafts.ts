import { eq, lt, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import { companyDrafts } from "./schema/company-drafts";

export type CompanyDraft = typeof companyDrafts.$inferSelect;

/**
 * Retention for an abandoned application (data-storage.md §4). Measured from
 * the last edit, not from creation - an applicant who returns weekly keeps
 * their work.
 */
export const COMPANY_DRAFT_RETENTION_DAYS = 90;

export async function findCompanyDraftByOwner(
  db: DbClient,
  ownerId: string,
): Promise<CompanyDraft | null> {
  const rows = await db
    .select()
    .from(companyDrafts)
    .where(eq(companyDrafts.ownerId, ownerId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Save the applicant's progress. One row per member, so a second save
 * overwrites the first rather than accumulating half-finished applications.
 *
 * `step` only ever moves forward: stepping back to correct an earlier answer
 * must not drag the resume point backwards with it.
 */
export async function upsertCompanyDraft(
  db: DbClient,
  ownerId: string,
  step: number,
  data: unknown,
): Promise<void> {
  await db
    .insert(companyDrafts)
    .values({ ownerId, step, data })
    .onConflictDoUpdate({
      target: companyDrafts.ownerId,
      set: {
        data,
        step: sql`greatest(${companyDrafts.step}, ${step})`,
        updatedAt: new Date(),
      },
    });
}

export async function deleteCompanyDraft(
  db: DbClient,
  ownerId: string,
): Promise<void> {
  await db.delete(companyDrafts).where(eq(companyDrafts.ownerId, ownerId));
}

/**
 * Hard-delete drafts untouched for longer than the retention period. Returns
 * how many were removed so the cron can report it.
 */
export async function deleteExpiredCompanyDrafts(
  db: DbClient,
  now: Date,
  retentionDays = COMPANY_DRAFT_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const removed = await db
    .delete(companyDrafts)
    .where(lt(companyDrafts.updatedAt, cutoff))
    .returning({ id: companyDrafts.id });

  return removed.length;
}

/**
 * Owners of drafts the next sweep will delete, collected before the delete
 * so their staged media prefixes are still derivable afterwards (ADR 0024).
 */
export async function listExpiredCompanyDraftOwnerIds(
  db: DbClient,
  now: Date,
  retentionDays = COMPANY_DRAFT_RETENTION_DAYS,
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ ownerId: companyDrafts.ownerId })
    .from(companyDrafts)
    .where(lt(companyDrafts.updatedAt, cutoff));
  return rows.map((r) => r.ownerId);
}
