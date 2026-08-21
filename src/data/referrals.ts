import { and, count, desc, eq, gt, inArray, lt } from "drizzle-orm";

import type { DbClient } from "./db";
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
