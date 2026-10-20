import { NextResponse } from "next/server";
import { db } from "@/data/db";
import { findMembersDueForErasure } from "@/data/account-erasure";
import {
  COMPANY_DRAFT_RETENTION_DAYS,
  deleteExpiredCompanyDrafts,
  listExpiredCompanyDraftOwnerIds,
} from "@/data/company-drafts";
import { deleteExpiredNotifications } from "@/data/notifications";
import { deleteExpiredConsentRecords } from "@/data/business-applications";
import { deleteProcessedOutboxRows } from "@/data/outbox";
import { env } from "@/env";
import {
  eraseMember,
  productionMemberErasureDeps,
} from "@/modules/identity/erase-member";
import { authorizeCronRequest } from "@/modules/platform";
import { deleteDraftMedia } from "@/modules/platform/draft-media-storage";

export interface RetentionResult {
  companyDraftsDeleted: number;
  accountsErased: number;
  accountErasuresFailed: number;
  outboxRowsDeleted: number;
  notificationsDeleted: number;
  consentRecordsDeleted: number;
}

/**
 * Retention sweeps (data-storage.md §4). Data we no longer hold cannot leak.
 *
 * Company application drafts (FR-040) are hard-deleted once untouched for
 * COMPANY_DRAFT_RETENTION_DAYS. The two other deletion paths are immediate and
 * live elsewhere: a submitted application drops its draft in
 * `registerCompanyAction`, and a deleted member takes theirs with them through
 * the foreign key.
 *
 * New retention rows belong here rather than in a cron of their own - one
 * sweep, one schedule, one place to look when a period is questioned.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  const now = new Date();

  // ADR 0024: staged onboarding media is keyed by the applicant, so the
  // owners must be known before their rows go.
  const expiredDraftOwners = await listExpiredCompanyDraftOwnerIds(db, now);

  const companyDraftsDeleted = await deleteExpiredCompanyDrafts(
    db,
    now,
    COMPANY_DRAFT_RETENTION_DAYS,
  );

  for (const ownerId of expiredDraftOwners) {
    try {
      await deleteDraftMedia(ownerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[retention] draft media deletion failed: ${message}`);
    }
  }

  // Processed outbox rows are evidence of a delivery that already happened;
  // once past the dedupe window they are pure history and the table should not
  // keep them forever.
  const outboxRowsDeleted = await deleteProcessedOutboxRows(db, now);

  // FR-099: an inbox is a record of recent events. Read or unread alike, a
  // notification nobody opened in six months is not one still being waited for.
  const notificationsDeleted = await deleteExpiredNotifications(db, now);

  // ADR 0044: consent evidence, six years from the agreement.
  const consentRecordsDeleted = await deleteExpiredConsentRecords(db, now);

  // FR-009: the 30-day clock on a deletion request runs out here.
  const due = await findMembersDueForErasure(db, now);
  let accountsErased = 0;
  let accountErasuresFailed = 0;

  const erasureDeps = await productionMemberErasureDeps();
  for (const { memberId, requestedAt } of due) {
    try {
      await eraseMember(db, erasureDeps, {
        memberId,
        requestedAt,
        now,
        trigger: { actorType: "system" },
      });
      accountsErased += 1;
    } catch (error) {
      accountErasuresFailed += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      // No member id in the message: this line goes to a log with a 30-day
      // life, and the erasure is the point.
      console.error(`[retention] account erasure failed: ${message}`);
    }
  }

  const result: RetentionResult = {
    companyDraftsDeleted,
    accountsErased,
    accountErasuresFailed,
    outboxRowsDeleted,
    notificationsDeleted,
    consentRecordsDeleted,
  };

  return NextResponse.json({ success: true, ...result });
}
