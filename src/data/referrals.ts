import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DbClient } from "./db";
import type { PageParams } from "./pagination";
import { companies, members, referrals } from "./schema";

export async function listReferralsSince(
  db: DbClient,
  senderId: string,
  since: Date,
) {
  return db.query.referrals.findMany({
    where: and(
      eq(referrals.senderId, senderId),
      gt(referrals.createdAt, since),
    ),
  });
}

export async function insertReferral(
  db: DbClient,
  values: typeof referrals.$inferInsert,
) {
  const [referral] = await db.insert(referrals).values(values).returning();
  return referral!;
}

export async function setReferralModeration(
  db: DbClient,
  referralId: string,
  status: "delivered" | "rejected",
  moderatorId: string,
  reason: string | undefined,
): Promise<void> {
  await db
    .update(referrals)
    .set({
      status,
      moderatorId,
      moderationReason: reason,
      updatedAt: new Date(),
      ...(status === "rejected"
        ? { contactChannel: null, clientName: "[Deleted]" }
        : {}),
    })
    .where(eq(referrals.id, referralId));
}

export async function findReferralWithRecipientCompany(
  db: DbClient,
  referralId: string,
) {
  return db.query.referrals.findFirst({
    where: eq(referrals.id, referralId),
    with: {
      recipientCompany: true,
    },
  });
}

export async function respondToReferral(
  db: DbClient,
  referralId: string,
  status: "accepted" | "declined",
  redact: boolean,
): Promise<void> {
  await db
    .update(referrals)
    .set({
      status,
      updatedAt: new Date(),
      ...(redact ? { contactChannel: null, clientName: "[Deleted]" } : {}),
    })
    .where(eq(referrals.id, referralId));
}

export async function setMemberReferralPermission(
  db: DbClient,
  memberId: string,
  canSendReferrals: boolean,
) {
  const [member] = await db
    .update(members)
    .set({ canSendReferrals, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning({
      id: members.id,
      canSendReferrals: members.canSendReferrals,
    });

  return member ?? null;
}

export async function listSentReferrals(db: DbClient, senderId: string) {
  return db.query.referrals.findMany({
    where: eq(referrals.senderId, senderId),
    orderBy: [desc(referrals.createdAt)],
    with: {
      recipientCompany: true,
    },
  });
}

export type SentReferralView = Awaited<
  ReturnType<typeof listSentReferrals>
>[number];

export async function listReceivedReferralsForCompanies(
  db: DbClient,
  companyIds: string[],
) {
  return db.query.referrals.findMany({
    where: and(
      inArray(referrals.recipientCompanyId, companyIds),
      inArray(referrals.status, [
        "delivered",
        "accepted",
        "declined",
        "expired",
      ]),
    ),
    orderBy: [desc(referrals.createdAt)],
    with: {
      recipientCompany: true,
      sender: true,
    },
  });
}

export type ReceivedReferralView = Awaited<
  ReturnType<typeof listReceivedReferralsForCompanies>
>[number];

/**
 * Introductions received by one company, for the staff company view.
 *
 * The client's name and contact channel are deliberately not selected. Staff
 * reviewing a partner need the volume and the outcome, not the client's
 * details, and a column that is never read cannot leak (ADR 0009). The
 * referral moderation screen, which does need them to moderate, keeps its own
 * query.
 */
export async function listReferralsByRecipientCompany(
  db: DbClient,
  companyId: string,
  limit = 20,
) {
  return db.query.referrals.findMany({
    where: eq(referrals.recipientCompanyId, companyId),
    columns: {
      id: true,
      status: true,
      serviceNeeded: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: [desc(referrals.createdAt)],
    limit,
  });
}

export type CompanyReferralView = Awaited<
  ReturnType<typeof listReferralsByRecipientCompany>
>[number];

export async function countReferralsByRecipientCompany(
  db: DbClient,
  companyId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: referrals.status, value: count() })
    .from(referrals)
    .where(eq(referrals.recipientCompanyId, companyId))
    .groupBy(referrals.status);

  return Object.fromEntries(rows.map((row) => [row.status, row.value]));
}

export const REFERRAL_ADMIN_STATUSES = [
  "pending_review",
  "delivered",
  "accepted",
  "declined",
  "rejected",
  "expired",
] as const;

export type ReferralAdminStatus = (typeof REFERRAL_ADMIN_STATUSES)[number];

export interface ReferralAdminFilters {
  query?: string;
  status?: ReferralAdminStatus;
}

/**
 * One WHERE for the page of rows and for the counts taken over it.
 *
 * The search deliberately spans the sender and the recipient company only.
 * The client's name is on this table too, but a moderator looking for one
 * referral finds it by who sent it or who it went to; making client identity
 * searchable would widen what this screen is for (ADR 0009).
 *
 * Each subquery names its own columns under its own alias: inside a relational
 * query drizzle rewrites embedded column references to the outer alias.
 */
function referralAdminWhere(filters: ReferralAdminFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        sql`exists (select 1 from ${members} as referral_sender where referral_sender.id = ${referrals.senderId} and referral_sender.display_name ilike ${pattern})`,
        sql`exists (select 1 from ${companies} as referral_company where referral_company.id = ${referrals.recipientCompanyId} and referral_company.name ilike ${pattern})`,
      )!,
    );
  }

  if (filters.status) {
    conditions.push(eq(referrals.status, filters.status));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * The staff directory of introductions in every status, as opposed to
 * listPendingReviewReferrals, which only ever showed the moderation queue and
 * still backs the overview widget and the nav badge.
 */
export async function listReferralsForAdmin(
  db: DbClient,
  filters: ReferralAdminFilters = {},
  page: PageParams = { limit: 50, offset: 0 },
) {
  return db.query.referrals.findMany({
    where: referralAdminWhere(filters),
    // The client's name, contact channel and the sender's note about them are
    // not selected. A client component's props are serialised into the page
    // payload, so a column rendered nowhere would still have been shipped to
    // the browser for every row; the moderator reads them one at a time from
    // findReferralForAdmin instead (ADR 0009).
    columns: {
      id: true,
      senderId: true,
      recipientCompanyId: true,
      serviceNeeded: true,
      status: true,
      createdAt: true,
      expiresAt: true,
    },
    with: {
      sender: {
        columns: {
          id: true,
          displayName: true,
        },
      },
      recipientCompany: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [desc(referrals.createdAt), desc(referrals.id)],
    limit: page.limit,
    offset: page.offset,
  });
}

/**
 * One introduction in full, including the client details the moderation
 * decision needs. Read when a drawer opens, for exactly one row.
 */
export async function findReferralForAdmin(db: DbClient, referralId: string) {
  return db.query.referrals.findFirst({
    where: eq(referrals.id, referralId),
    with: {
      sender: true,
      recipientCompany: true,
    },
  });
}

export type ReferralAdminDetail = NonNullable<
  Awaited<ReturnType<typeof findReferralForAdmin>>
>;

export type ReferralAdminView = Awaited<
  ReturnType<typeof listReferralsForAdmin>
>[number];

export async function countReferralsForAdmin(
  db: DbClient,
  filters: ReferralAdminFilters = {},
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(referrals)
    .where(referralAdminWhere(filters));

  return row?.value ?? 0;
}

/**
 * Counts for the status filter chips. Ignores the status filter itself - a chip
 * shows what selecting it would find.
 */
export async function countReferralsByStatus(
  db: DbClient,
  filters: Omit<ReferralAdminFilters, "status"> = {},
): Promise<Record<ReferralAdminStatus, number>> {
  const rows = await db
    .select({ status: referrals.status, value: count() })
    .from(referrals)
    .where(referralAdminWhere(filters))
    .groupBy(referrals.status);

  const counts = Object.fromEntries(
    REFERRAL_ADMIN_STATUSES.map((status) => [status, 0]),
  ) as Record<ReferralAdminStatus, number>;

  for (const row of rows) {
    counts[row.status] = row.value;
  }

  return counts;
}

export async function listPendingReviewReferrals(db: DbClient) {
  return db.query.referrals.findMany({
    where: eq(referrals.status, "pending_review"),
    orderBy: [desc(referrals.createdAt)],
    with: {
      sender: true,
      recipientCompany: true,
    },
  });
}

export type PendingReferralView = Awaited<
  ReturnType<typeof listPendingReviewReferrals>
>[number];

export async function listCompanyIdsByOwner(
  db: DbClient,
  ownerId: string,
): Promise<string[]> {
  const rows = await db.query.companies.findMany({
    where: eq(companies.ownerId, ownerId),
  });
  return rows.map((c) => c.id);
}

/**
 * FR-077: expire referrals not acted on within 14 days and delete the
 * contact details in the same statement. Covers both `delivered` (sent to
 * the recipient, who never accepted or declined) and `pending_review`
 * (staff never moderated it) - both are "not acted on", and neither is a
 * terminal state on its own.
 */
export async function expireOverdueReferrals(
  db: DbClient,
  now: Date,
): Promise<number> {
  const expired = await db
    .update(referrals)
    .set({
      status: "expired",
      contactChannel: null,
      clientName: "[Deleted due to expiration]",
      updatedAt: now,
    })
    .where(
      and(
        inArray(referrals.status, ["delivered", "pending_review"]),
        lt(referrals.expiresAt, now),
      ),
    )
    .returning({ id: referrals.id });

  return expired.length;
}
