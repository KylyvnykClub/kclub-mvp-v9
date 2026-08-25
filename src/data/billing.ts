import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";

import {
  ACCESS_GRANTING_SUBSCRIPTION_STATUSES,
  GRACE_PERIOD_DAYS,
} from "./billing-access";
import type { Db, DbClient, DbTx } from "./db";
import {
  BILLING_NOTIFICATION_TOPIC,
  GRACE_EXPIRY_WARNING_NOTIFICATION,
} from "./outbox";

// Re-exported so the access rule and dunning window keep their public import
// path (@/data/billing) while their definitions live in the DB-free
// billing-access module.
export {
  ACCESS_GRANTING_SUBSCRIPTION_STATUSES,
  GRACE_PERIOD_DAYS,
  tierForSubscriptionStatus,
} from "./billing-access";
import {
  cards,
  members,
  outbox,
  processedWebhooks,
  stripeCustomers,
  subscriptions,
} from "./schema";

export async function findStripeCustomerIdByMember(
  db: DbClient,
  memberId: string,
): Promise<string | null> {
  const existing = await db.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.memberId, memberId),
  });
  return existing?.stripeCustomerId ?? null;
}

export async function insertStripeCustomerMapping(
  db: DbClient,
  memberId: string,
  stripeCustomerId: string,
): Promise<void> {
  await db.insert(stripeCustomers).values({
    memberId,
    stripeCustomerId,
  });
}

export async function upsertStripeCustomerMapping(
  db: DbClient,
  memberId: string,
  stripeCustomerId: string,
): Promise<void> {
  await db
    .insert(stripeCustomers)
    .values({
      memberId,
      stripeCustomerId,
    })
    .onConflictDoUpdate({
      target: stripeCustomers.memberId,
      set: {
        stripeCustomerId,
        updatedAt: new Date(),
      },
    });
}

export async function listSubscriptionsByMember(
  db: DbClient,
  memberId: string,
) {
  return db.query.subscriptions.findMany({
    where: eq(subscriptions.memberId, memberId),
  });
}

export type SubscriptionRow = Awaited<
  ReturnType<typeof listSubscriptionsByMember>
>[number];

export async function listSubscriptionsByCompanyId(
  db: DbClient,
  companyId: string,
) {
  return db.query.subscriptions.findMany({
    where: eq(subscriptions.companyId, companyId),
    orderBy: [desc(subscriptions.currentPeriodEnd)],
  });
}

export async function listAllSubscriptions(db: DbClient) {
  return db.query.subscriptions.findMany();
}

export type AnySubscriptionRow = Awaited<
  ReturnType<typeof listAllSubscriptions>
>[number];

export async function listActiveSubscriptionsForDeletion(
  db: DbClient,
  memberId: string,
) {
  return db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.memberId, memberId),
      inArray(subscriptions.status, [...ACCESS_GRANTING_SUBSCRIPTION_STATUSES]),
    ),
    with: { company: true },
  });
}

export type DeletionSubscriptionRow = Awaited<
  ReturnType<typeof listActiveSubscriptionsForDeletion>
>[number];

export async function findActiveSubscriptionByPrice(
  db: DbClient,
  memberId: string,
  priceId: string,
) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.memberId, memberId),
      eq(subscriptions.status, "active"),
      eq(subscriptions.priceId, priceId),
    ),
  });
}

export async function findActiveVipSubscription(
  db: DbClient,
  memberId: string,
) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.memberId, memberId),
      isNull(subscriptions.companyId),
      eq(subscriptions.status, "active"),
    ),
  });
}

export interface SubscriptionUpsert {
  stripeSubscriptionId: string;
  memberId: string;
  companyId: string | null;
  stripeCustomerId: string;
  status: string;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: Date | null;
  canceledAt: Date | null;

  /** ADR 0004 watermark: the Stripe subscription's `updated` timestamp. */
  stripeUpdatedAt: Date;
}

export async function findSubscriptionByStripeId(
  db: DbClient,
  stripeSubscriptionId: string,
) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
  });
}

export async function upsertSubscription(
  db: DbClient,
  values: SubscriptionUpsert,
): Promise<void> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, values.stripeSubscriptionId),
  });

  if (existing) {
    await db
      .update(subscriptions)
      .set(values)
      .where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values(values);
  }
}

export async function setSubscriptionStatus(
  db: DbClient,
  stripeSubscriptionId: string,
  status: string,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

/**
 * Find subscriptions that are locally `active` but past their period end.
 * These need re-fetching from Stripe to detect cancellation or lapse (FR-054).
 */
export async function findLapsedSubscriptions(
  db: DbClient,
  now: Date,
): Promise<Array<{ stripeSubscriptionId: string }>> {
  return db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        lte(subscriptions.currentPeriodEnd, now),
      ),
    );
}

/**
 * How far ahead of the grace deadline the subscriber is warned.
 *
 * Three days, not one. The sweep runs once a day, so a one-day window tiles
 * exactly and loses a subscriber entirely to a single skipped or delayed run.
 * Three absorbs daily granularity, one wholly missed run, and the lag between
 * enqueueing and draining - and still leaves at least two days to fix a card.
 */
export const GRACE_WARNING_LEAD_DAYS = 3;

export interface GraceWarningCandidate {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  memberId: string;
  companyId: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * When the dunning clock started for a subscription that is currently
 * `past_due`.
 *
 * Stripe advances a subscription's period when the renewal invoice is
 * *created*, not when it is paid, so for a `past_due` row `currentPeriodStart`
 * is the moment the failing invoice was issued and `currentPeriodEnd` is still
 * in the future. Pinned by an assertion in tests/billing-lifecycle.stripe.test.ts
 * against a real test clock, because the whole window depends on it.
 *
 * The fallback to `currentPeriodEnd` keeps the query correct if that behaviour
 * ever changes - a row whose period has already ended failed at its end.
 */
export function graceAnchorOf(
  row: Pick<GraceWarningCandidate, "currentPeriodStart" | "currentPeriodEnd">,
  now: Date,
): Date {
  return row.currentPeriodEnd > now
    ? row.currentPeriodStart
    : row.currentPeriodEnd;
}

/**
 * FR-056: subscribers in the dunning grace period whose access is about to be
 * revoked and who have not already been warned in this billing period.
 *
 * The deduplication is the outbox itself rather than a column on the
 * subscription: a warning already enqueued since this period began suppresses
 * the next sweep, whether or not it has been drained yet. That deliberately
 * needs no migration.
 */
export async function findSubscriptionsNearingGraceExpiry(
  db: DbClient,
  now: Date,
  gracePeriodDays: number = GRACE_PERIOD_DAYS,
  leadDays: number = GRACE_WARNING_LEAD_DAYS,
): Promise<GraceWarningCandidate[]> {
  const graceMs = gracePeriodDays * MS_PER_DAY;
  const leadMs = leadDays * MS_PER_DAY;

  // We want `now < anchor + graceMs <= now + leadMs`, rearranged so that all
  // the arithmetic happens here and SQL only compares two timestamps.
  const anchorAfter = new Date(now.getTime() - graceMs);
  const anchorUpTo = new Date(now.getTime() + leadMs - graceMs);

  // Both period columns are naive `timestamp`, while `now` arrives as
  // `timestamptz`. Every comparison below converts explicitly, for the same
  // reason the outbox subquery does: without it Postgres casts using the
  // session TimeZone, the test container is UTC, and a non-UTC production
  // session would shift the whole window with every test still green.
  const anchor = sql`case
    when (${subscriptions.currentPeriodEnd} at time zone 'utc') > ${now}
    then (${subscriptions.currentPeriodStart} at time zone 'utc')
    else (${subscriptions.currentPeriodEnd} at time zone 'utc')
  end`;

  return db
    .select({
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      memberId: subscriptions.memberId,
      companyId: subscriptions.companyId,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "past_due"),
        sql`${anchor} > ${anchorAfter}`,
        sql`${anchor} <= ${anchorUpTo}`,
        notExists(
          db
            .select({ one: sql`1` })
            .from(outbox)
            .where(
              and(
                eq(outbox.topic, BILLING_NOTIFICATION_TOPIC),
                sql`${outbox.payload} ->> 'type' = ${GRACE_EXPIRY_WARNING_NOTIFICATION}`,
                sql`${outbox.payload} ->> 'subscriptionId' = ${subscriptions.stripeSubscriptionId}`,
                sql`${outbox.createdAt} > (${subscriptions.currentPeriodStart} at time zone 'utc')`,
              ),
            ),
        ),
      ),
    );
}

export async function setCardTierForMember(
  db: DbClient,
  memberId: string,
  tier: "free" | "vip",
): Promise<void> {
  await db.update(cards).set({ tier }).where(eq(cards.memberId, memberId));
}

export async function findMemberByStripeCustomerId(
  db: DbClient,
  stripeCustomerId: string,
): Promise<{ memberId: string; displayName: string; language: string } | null> {
  const row = await db
    .select({
      memberId: members.id,
      displayName: members.displayName,
      language: members.language,
    })
    .from(stripeCustomers)
    .innerJoin(members, eq(members.id, stripeCustomers.memberId))
    .where(eq(stripeCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);

  return row[0] ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "23505";
}

/**
 * Runs `handler` exactly once per Stripe event id. The event id is recorded
 * inside the same transaction as the projection, and the primary key on
 * processed_webhooks is what enforces idempotency: a concurrent duplicate
 * fails the insert and the whole transaction rolls back.
 * Returns false when the event was already processed.
 */
export async function processWebhookOnce(
  db: Db,
  eventId: string,
  eventType: string,
  handler: (tx: DbTx) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.processedWebhooks.findFirst({
      where: eq(processedWebhooks.id, eventId),
    });
    if (existing) {
      return false;
    }

    try {
      await tx.insert(processedWebhooks).values({
        id: eventId,
        type: eventType,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }

    await handler(tx);
    return true;
  });
}
