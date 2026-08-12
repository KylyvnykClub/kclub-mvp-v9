import { and, eq, lte } from "drizzle-orm";

import type { Db, DbClient, DbTx } from "./db";
import {
  cards,
  members,
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
