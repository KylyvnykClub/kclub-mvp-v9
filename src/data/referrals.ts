import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";

import type { DbClient } from "./db";
import { companies, referrals } from "./schema";

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
    where: inArray(referrals.recipientCompanyId, companyIds),
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
 * FR-077: expire delivered referrals past their expiry and delete the
 * contact details in the same statement.
 */
export async function expireDeliveredReferrals(
  db: DbClient,
  now: Date,
): Promise<number> {
  const expired = await db
    .update(referrals)
    .set({
      status: "expired",
      contactChannel: null,
      clientName: "[Deleted due to expiration]",
      updatedAt: new Date(),
    })
    .where(and(eq(referrals.status, "delivered"), lt(referrals.expiresAt, now)))
    .returning({ id: referrals.id });

  return expired.length;
}
