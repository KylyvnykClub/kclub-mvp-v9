import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type { DbClient } from "./db";
import {
  companies,
  consentRecords,
  invitations,
  listingActivations,
} from "./schema";
import type {
  ApplicationRoute,
  PaymentAuthorityWording,
} from "@/domain/business-application";

export type ConsentRecordInsert = typeof consentRecords.$inferInsert;
export type ListingActivationRow = typeof listingActivations.$inferSelect;

export async function insertConsentRecords(
  db: DbClient,
  rows: ConsentRecordInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(consentRecords).values(rows);
}

/**
 * The checkout gate (ADR 0044 §2): has the owner of this company agreed to
 * exactly this payment wording? A record of another wording is not enough - a
 * consent to a free month is not a consent to a reservation.
 */
export async function hasPaymentAuthority(
  db: DbClient,
  companyId: string,
  memberId: string,
  wording: PaymentAuthorityWording,
): Promise<boolean> {
  const row = await db.query.consentRecords.findFirst({
    where: and(
      eq(consentRecords.companyId, companyId),
      eq(consentRecords.memberId, memberId),
      eq(consentRecords.kind, "payment_authority"),
      eq(consentRecords.wording, wording),
    ),
    columns: { id: true },
  });
  return row !== undefined;
}

/** When the consents for this company were given - the contract's start. */
export async function findPaymentAuthority(db: DbClient, companyId: string) {
  return db.query.consentRecords.findFirst({
    where: and(
      eq(consentRecords.companyId, companyId),
      eq(consentRecords.kind, "payment_authority"),
    ),
    orderBy: (record, { desc }) => [desc(record.acceptedAt)],
  });
}

/**
 * Whether this member came in through a partner invite link that has not yet
 * been used on an application (ADR 0042, ADR 0044). Read-only: the route is
 * shown before anything is filed, and spent only when an application is.
 */
export async function findUnspentPartnerInvitation(
  db: DbClient,
  memberId: string,
) {
  return db.query.invitations.findFirst({
    where: and(
      eq(invitations.inviteeMemberId, memberId),
      eq(invitations.kind, "partner"),
      eq(invitations.waived, true),
      isNull(invitations.waiverUsedAt),
    ),
    columns: { inviteLinkId: true },
  });
}

export async function setApplicationRoute(
  db: DbClient,
  companyId: string,
  route: ApplicationRoute,
  inviteLinkId: string | null,
): Promise<void> {
  await db
    .update(companies)
    .set({ applicationRoute: route, applicationInviteLinkId: inviteLinkId })
    .where(eq(companies.id, companyId));
}

export async function insertListingActivation(
  db: DbClient,
  row: typeof listingActivations.$inferInsert,
): Promise<void> {
  await db.insert(listingActivations).values(row).onConflictDoNothing();
}

export async function findListingActivation(
  db: DbClient,
  companyId: string,
): Promise<ListingActivationRow | null> {
  const row = await db.query.listingActivations.findFirst({
    where: eq(listingActivations.companyId, companyId),
  });
  return row ?? null;
}

export async function findListingActivationBySubscription(
  db: DbClient,
  stripeSubscriptionId: string,
): Promise<ListingActivationRow | null> {
  const row = await db.query.listingActivations.findFirst({
    where: eq(listingActivations.stripeSubscriptionId, stripeSubscriptionId),
  });
  return row ?? null;
}

export async function updateListingActivation(
  db: DbClient,
  companyId: string,
  patch: Partial<typeof listingActivations.$inferInsert>,
): Promise<void> {
  await db
    .update(listingActivations)
    .set(patch)
    .where(eq(listingActivations.companyId, companyId));
}

/**
 * Activations a daily sweep should try to start: card saved, no subscription
 * yet, and any EU start date passed (ADR 0044 §5). The full rule is
 * `activationDue`, applied again per company; this only narrows the set.
 */
export async function listActivationsDueForStart(
  db: DbClient,
  now: Date,
): Promise<string[]> {
  const rows = await db
    .select({ companyId: listingActivations.companyId })
    .from(listingActivations)
    .innerJoin(companies, eq(companies.id, listingActivations.companyId))
    .where(
      and(
        isNull(listingActivations.stripeSubscriptionId),
        isNotNull(listingActivations.paymentMethodId),
        eq(companies.moderationStatus, "approved"),
        isNull(companies.withdrawnAt),
        or(
          isNull(listingActivations.startNotBefore),
          lte(listingActivations.startNotBefore, now),
        ),
      ),
    );
  return rows.map((row) => row.companyId);
}

/**
 * The owner withdraws the application, or the contract (ADR 0044 §4, §5).
 * Moderation reads `rejected`, so every place that stops publishing and
 * billing for a refused company does the same here; `withdrawn_at` says it
 * was the owner's choice. Conditional, so a second click changes nothing.
 * `pendingOnly` is the ordinary withdrawal: before approval.
 */
export async function withdrawCompany(
  db: DbClient,
  input: {
    companyId: string;
    ownerId: string;
    now: Date;
    pendingOnly: boolean;
    reason: string;
  },
): Promise<boolean> {
  const changed = await db
    .update(companies)
    .set({
      withdrawnAt: input.now,
      moderationStatus: "rejected",
      rejectionReason: input.reason,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(companies.id, input.companyId),
        eq(companies.ownerId, input.ownerId),
        isNull(companies.withdrawnAt),
        ...(input.pendingOnly
          ? [eq(companies.moderationStatus, "pending")]
          : []),
      ),
    )
    .returning({ id: companies.id });
  return changed.length > 0;
}

export interface InviteTrialCounters {
  /** Accounts registered through a member's partner link. */
  registered: number;
  /** Applications filed on the invite route. */
  applied: number;
  approved: number;
  /** Published, with the free month started. */
  activated: number;
  /** The first invoice with money in it was paid. */
  firstPaid: number;
  /** Listed right now: in the free month or paying. */
  activeNow: number;
}

/**
 * The invite route, counted separately at each step (ADR 0044 §7), for the
 * owner's console only. Counts, never names: who brought whom stays on the
 * member sheet (FR-126).
 */
export async function countInviteTrialFunnel(
  db: DbClient,
): Promise<InviteTrialCounters> {
  const [row] = await db
    .execute<{
      registered: number;
      applied: number;
      approved: number;
      activated: number;
      first_paid: number;
      active_now: number;
    }>(
      sql`
    SELECT
      (SELECT count(*)::int FROM "invitations" WHERE "kind" = 'partner') AS registered,
      (SELECT count(*)::int FROM "companies" WHERE "application_route" = 'invite') AS applied,
      (SELECT count(*)::int FROM "companies" WHERE "application_route" = 'invite' AND "moderation_status" = 'approved') AS approved,
      (SELECT count(*)::int FROM "listing_activations" WHERE "free_month" AND "published_at" IS NOT NULL) AS activated,
      (SELECT count(*)::int FROM "listing_activations" WHERE "free_month" AND "first_paid_at" IS NOT NULL) AS first_paid,
      (SELECT count(*)::int FROM "listing_activations" la
         JOIN "subscriptions" s ON s."stripe_subscription_id" = la."stripe_subscription_id"
         WHERE la."free_month" AND s."status" IN ('trialing', 'active', 'past_due')) AS active_now
  `,
    )
    .then((result) => result.rows);

  return {
    registered: Number(row?.registered ?? 0),
    applied: Number(row?.applied ?? 0),
    approved: Number(row?.approved ?? 0),
    activated: Number(row?.activated ?? 0),
    firstPaid: Number(row?.first_paid ?? 0),
    activeNow: Number(row?.active_now ?? 0),
  };
}

/**
 * Consent evidence is kept six years from the agreement (data-storage.md):
 * the longest limitation period for a contract claim among the markets the
 * club sells to. Past it, the record has no purpose left and goes.
 */
export const CONSENT_RECORD_RETENTION_YEARS = 6;

export async function deleteExpiredConsentRecords(
  db: DbClient,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(
    cutoff.getUTCFullYear() - CONSENT_RECORD_RETENTION_YEARS,
  );
  const deleted = await db
    .delete(consentRecords)
    .where(lte(consentRecords.acceptedAt, cutoff))
    .returning({ id: consentRecords.id });
  return deleted.length;
}
