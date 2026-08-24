import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { appendAuditEntry } from "@/data/audit-log";
import {
  eraseMemberTx,
  findMembersDueForErasure,
} from "@/data/account-erasure";
import {
  COMPANY_DRAFT_RETENTION_DAYS,
  deleteExpiredCompanyDrafts,
} from "@/data/company-drafts";
import { deleteProcessedOutboxRows } from "@/data/outbox";
import { env } from "@/env";
import { eraseStripeCustomerForMember } from "@/modules/billing/erasure";
import { authorizeCronRequest } from "@/modules/platform";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

export interface RetentionResult {
  companyDraftsDeleted: number;
  accountsErased: number;
  accountErasuresFailed: number;
  outboxRowsDeleted: number;
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

  const companyDraftsDeleted = await deleteExpiredCompanyDrafts(
    db,
    now,
    COMPANY_DRAFT_RETENTION_DAYS,
  );

  // Processed outbox rows are evidence of a delivery that already happened;
  // once past the dedupe window they are pure history and the table should not
  // keep them forever.
  const outboxRowsDeleted = await deleteProcessedOutboxRows(db, now);

  // FR-009: the 30-day clock on a deletion request runs out here.
  const due = await findMembersDueForErasure(db, now);
  let accountsErased = 0;
  let accountErasuresFailed = 0;

  for (const { memberId, requestedAt } of due) {
    try {
      // data-storage.md §4 step 4, before the database half: a member with
      // no Stripe Customer at all makes this a no-op.
      await eraseStripeCustomerForMember(
        db,
        {
          cancelSubscription: (id) => stripe.subscriptions.cancel(id),
          deleteCustomer: (id) => stripe.customers.del(id),
        },
        memberId,
      );

      await eraseMemberTx(db, memberId, now);
      accountsErased += 1;

      // data-storage.md §4 step 8: the audit log records that an erasure
      // occurred, by internal id only - never by anything it just destroyed.
      await appendAuditEntry(db, {
        actorType: "system",
        action: "member.erased",
        subjectType: "member",
        subjectId: memberId,
        meta: {
          requestedAt: requestedAt.toISOString(),
          erasedAt: now.toISOString(),
        },
      });
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
  };

  return NextResponse.json({ success: true, ...result });
}
