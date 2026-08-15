import { NextResponse } from "next/server";
import { db } from "@/data/db";
import {
  COMPANY_DRAFT_RETENTION_DAYS,
  deleteExpiredCompanyDrafts,
} from "@/data/company-drafts";
import { env } from "@/env";
import { authorizeCronRequest } from "@/modules/platform";

export interface RetentionResult {
  companyDraftsDeleted: number;
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

  const companyDraftsDeleted = await deleteExpiredCompanyDrafts(
    db,
    new Date(),
    COMPANY_DRAFT_RETENTION_DAYS,
  );

  const result: RetentionResult = { companyDraftsDeleted };

  return NextResponse.json({ success: true, ...result });
}
