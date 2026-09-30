import {
  and,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DbClient } from "./db";
import { companies, listingHolds } from "./schema";

/**
 * The listing-hold projection (ADR 0037). SQL for `listing_holds` lives here
 * and nowhere else; the rules that decide what to do with a hold are in
 * `src/domain/listing-hold.ts`.
 */

export type ListingHoldRow = typeof listingHolds.$inferSelect;

export interface ListingHoldUpsert {
  stripePaymentIntentId: string;
  companyId: string;
  memberId: string;
  stripeCustomerId: string;
  status: string;
  amountMinor: number;
  currency: string;
  captureBefore: Date | null;
  capturedAt: Date | null;
  coversUntil: Date | null;
  refundedAt: Date | null;
  stripeUpdatedAt: Date;
}

export async function findListingHold(
  db: DbClient,
  paymentIntentId: string,
): Promise<ListingHoldRow | undefined> {
  const [row] = await db
    .select()
    .from(listingHolds)
    .where(eq(listingHolds.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  return row;
}

/** Newest first, which is the order every reader wants them in. */
export async function listListingHoldsByCompany(
  db: DbClient,
  companyId: string,
): Promise<ListingHoldRow[]> {
  return db
    .select()
    .from(listingHolds)
    .where(eq(listingHolds.companyId, companyId))
    .orderBy(desc(listingHolds.createdAt));
}

/**
 * Write the state Stripe reported, unless a newer event has already been
 * applied (FR-053). Returns whether anything was written.
 *
 * The watermark check is in the statement itself - the conflict update carries
 * a `WHERE` on the stored watermark - so a late delivery cannot regress a row
 * a newer event already wrote.
 * `capture_requested_at` and `stripe_subscription_id` are ours rather than
 * Stripe's and are never overwritten here.
 */
export async function upsertListingHold(
  db: DbClient,
  values: ListingHoldUpsert,
): Promise<boolean> {
  const written = await db
    .insert(listingHolds)
    .values(values)
    .onConflictDoUpdate({
      target: listingHolds.stripePaymentIntentId,
      set: {
        status: values.status,
        amountMinor: values.amountMinor,
        currency: values.currency,
        captureBefore: values.captureBefore,
        capturedAt: values.capturedAt,
        coversUntil: values.coversUntil,
        refundedAt: values.refundedAt,
        stripeUpdatedAt: values.stripeUpdatedAt,
        updatedAt: new Date(),
      },
      // Not older than what is stored. Equal is applied: two events can share
      // a second, and the values come from a fresh read of the PaymentIntent
      // rather than from either payload, so the later write is never staler.
      setWhere: sql`${listingHolds.stripeUpdatedAt} IS NULL OR ${listingHolds.stripeUpdatedAt} <= ${values.stripeUpdatedAt.toISOString()}::timestamptz`,
    })
    .returning({ id: listingHolds.id });

  return written.length > 0;
}

/** Record that approval asked Stripe to capture. First request wins. */
export async function markListingHoldCaptureRequested(
  db: DbClient,
  paymentIntentId: string,
  at: Date,
): Promise<void> {
  await db
    .update(listingHolds)
    .set({ captureRequestedAt: at, updatedAt: at })
    .where(
      and(
        eq(listingHolds.stripePaymentIntentId, paymentIntentId),
        isNull(listingHolds.captureRequestedAt),
      ),
    );
}

/**
 * Record a refund our own action issued. Only ever takes access away, which is
 * why it may be written before Stripe's own event confirms it.
 */
export async function markListingHoldRefunded(
  db: DbClient,
  paymentIntentId: string,
  at: Date,
): Promise<void> {
  await db
    .update(listingHolds)
    .set({ refundedAt: at, updatedAt: at })
    .where(
      and(
        eq(listingHolds.stripePaymentIntentId, paymentIntentId),
        isNull(listingHolds.refundedAt),
      ),
    );
}

/**
 * Record the monthly subscription started from a hold. Only the first write
 * lands, so two workers racing to start it cannot overwrite each other's id.
 */
export async function setListingHoldSubscription(
  db: DbClient,
  paymentIntentId: string,
  stripeSubscriptionId: string,
): Promise<void> {
  await db
    .update(listingHolds)
    .set({ stripeSubscriptionId, updatedAt: new Date() })
    .where(
      and(
        eq(listingHolds.stripePaymentIntentId, paymentIntentId),
        isNull(listingHolds.stripeSubscriptionId),
      ),
    );
}

/**
 * Companies whose listing is currently paid for by a captured hold - the first
 * month, before the subscription's own billing takes over (ADR 0037).
 */
export async function listCompanyIdsPaidByHold(
  db: DbClient,
  now: Date,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ companyId: listingHolds.companyId })
    .from(listingHolds)
    .where(paidByHold(now));
  return rows.map((row) => row.companyId);
}

export async function companyIsPaidByHold(
  db: DbClient,
  companyId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: listingHolds.id })
    .from(listingHolds)
    .where(and(eq(listingHolds.companyId, companyId), paidByHold(now)))
    .limit(1);
  return row !== undefined;
}

export async function memberIsPaidByHold(
  db: DbClient,
  memberId: string,
  now: Date,
): Promise<boolean> {
  // Only a hold on an approved company opens the club: a capture that landed
  // after a rejection is being refunded, and pays for nothing.
  const [row] = await db
    .select({ id: listingHolds.id })
    .from(listingHolds)
    .innerJoin(companies, eq(companies.id, listingHolds.companyId))
    .where(
      and(
        eq(listingHolds.memberId, memberId),
        eq(companies.moderationStatus, "approved"),
        paidByHold(now),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Companies whose price is authorised on the card and still capturable - what
 * the moderation queue marks as "card reserved". The SQL twin of
 * `holdIsCapturable`.
 */
export async function listCompanyIdsWithCapturableHold(
  db: DbClient,
  now: Date,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ companyId: listingHolds.companyId })
    .from(listingHolds)
    .where(
      and(
        eq(listingHolds.status, "requires_capture"),
        or(
          isNull(listingHolds.captureBefore),
          gt(listingHolds.captureBefore, now),
        ),
      ),
    );
  return rows.map((row) => row.companyId);
}

/**
 * True for a `companies` row with a capturable hold - the same rule as
 * `listCompanyIdsWithCapturableHold`, as a correlated EXISTS so the moderation
 * queue can filter and count on it in one statement (FR-113: a company waits
 * for review only once its price is reserved on the card).
 */
export function companyHasCapturableHold(now: Date): SQL {
  // Spelled out rather than interpolated from the table objects: inside a
  // relational `findMany` drizzle re-aliases every column reference to the
  // root table, which turned `listing_holds.company_id` into
  // `companies.company_id`. "companies" is the alias both query styles use.
  return sql`EXISTS (SELECT 1 FROM "listing_holds" lh WHERE lh."company_id" = "companies"."id" AND lh."status" = 'requires_capture' AND (lh."capture_before" IS NULL OR lh."capture_before" > ${now.toISOString()}::timestamptz))`;
}

/**
 * The SQL twin of `holdPaysForListing` in src/domain/listing-hold.ts. Kept
 * beside the query that uses it; the integration suite checks the two agree.
 */
function paidByHold(now: Date) {
  return and(
    eq(listingHolds.status, "succeeded"),
    isNull(listingHolds.refundedAt),
    isNotNull(listingHolds.capturedAt),
    gt(listingHolds.coversUntil, now),
  );
}
