import type Stripe from "stripe";
import type { DbClient } from "@/data/db";
import {
  findSubscriptionByStripeId,
  setCardTierForMember,
  tierForSubscriptionStatus,
  upsertSubscription,
  type SubscriptionUpsert,
} from "@/data/billing";

/**
 * Outbox topic consumed by the billing projection worker. Written by the
 * Stripe webhook endpoint; drained by the outbox-drain cron route.
 */
export const BILLING_OUTBOX_TOPIC = "billing.subscription.sync";

/**
 * Outbox topic for billing-related notifications (payment failures, grace
 * expiry). Defined in the data layer beside the table, because the grace-expiry
 * query deduplicates against outbox rows and cannot import from here without a
 * cycle. Re-exported so existing call sites keep their import path.
 */
export { BILLING_NOTIFICATION_TOPIC } from "@/data/outbox";

/** Dependency: retrieves one subscription from Stripe, throwing on network errors. */
export type SubscriptionFetcher = (
  subscriptionId: string,
) => Promise<Stripe.Subscription>;

/** Result of projecting one subscription from Stripe. */
export type ProjectionResult = "applied" | "stale" | "deleted";

function subscriptionToUpsert(
  subscription: Stripe.Subscription,
  watermark: Date,
): SubscriptionUpsert {
  const item = subscription.items.data[0];
  const memberId = subscription.metadata.memberId;
  const companyId = subscription.metadata.companyId;

  if (!memberId) {
    throw new Error("Missing memberId in subscription metadata");
  }

  return {
    stripeSubscriptionId: subscription.id,
    memberId,
    companyId: companyId ?? null,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    status: subscription.status,
    priceId: item?.price?.id ?? "",
    currentPeriodStart: new Date((item?.current_period_start ?? 0) * 1000),
    currentPeriodEnd: new Date((item?.current_period_end ?? 0) * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end
      ? new Date((subscription.cancel_at ?? 0) * 1000)
      : null,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : null,
    stripeUpdatedAt: watermark,
  };
}

/**
 * Project the current state of a subscription onto our local projection
 * (ADR 0004). The subscription is re-fetched from the Stripe API — never the
 * webhook payload's fields — so a forged payload still cannot grant an
 * entitlement Stripe does not agree with (integration.md §4).
 *
 * `eventCreated` is the Stripe event's `created` timestamp, which is the
 * ordering key for the watermark: the Subscription object has no `updated`
 * field in the pinned API version, and Stripe's clock is skew-free relative to
 * ours. A delivery whose event is not newer than the stored watermark is a
 * late delivery and changes nothing (FR-053 — correct under out-of-order
 * delivery).
 */
export async function reconcileSubscription(
  db: DbClient,
  fetchSubscription: SubscriptionFetcher,
  subscriptionId: string,
  eventCreated: number,
): Promise<ProjectionResult> {
  const watermark = new Date(eventCreated * 1000);

  // Fast path: an event older than what is already applied needs no Stripe
  // call at all.
  const existing = await findSubscriptionByStripeId(db, subscriptionId);
  if (existing?.stripeUpdatedAt && watermark <= existing.stripeUpdatedAt) {
    return "stale";
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await fetchSubscription(subscriptionId);
  } catch (error) {
    if (isResourceMissing(error)) {
      await markDeleted(db, existing, watermark);
      return "deleted";
    }
    throw error;
  }

  return foldSubscription(db, subscription, watermark);
}

/**
 * Fold the current subscription state into our rows (transactional). The
 * watermark written is the event's `created` timestamp, applied inside the
 * same transaction as the projection. The stale check runs again inside the
 * transaction, so two concurrent events for the same subscription cannot race:
 * the second writer reads the first writer's watermark and backs off.
 */
export async function foldSubscription(
  db: DbClient,
  subscription: Stripe.Subscription,
  watermark: Date,
): Promise<ProjectionResult> {
  const values = subscriptionToUpsert(subscription, watermark);

  const result = await db.transaction(async (tx) => {
    const current = await findSubscriptionByStripeId(
      tx,
      values.stripeSubscriptionId,
    );
    if (current?.stripeUpdatedAt && watermark <= current.stripeUpdatedAt) {
      return "stale" as const;
    }

    await upsertSubscription(tx, values);
    // A subscription without a company is a VIP membership (FR-050). The
    // entitlement is projected onto the member's card tier through the single
    // access rule (data/billing.ts): FR-056 keeps past_due while Stripe retries,
    // and every terminal status demotes.
    if (!values.companyId) {
      await setCardTierForMember(
        tx,
        values.memberId,
        tierForSubscriptionStatus(subscription.status),
      );
    }
    return "applied" as const;
  });

  return result;
}

async function markDeleted(
  db: DbClient,
  existing: Awaited<ReturnType<typeof findSubscriptionByStripeId>>,
  watermark: Date,
): Promise<void> {
  if (!existing) return;

  await db.transaction(async (tx) => {
    await upsertSubscription(tx, {
      stripeSubscriptionId: existing.stripeSubscriptionId,
      memberId: existing.memberId,
      companyId: existing.companyId,
      stripeCustomerId: existing.stripeCustomerId,
      status: "deleted",
      priceId: existing.priceId,
      currentPeriodStart: existing.currentPeriodStart,
      currentPeriodEnd: existing.currentPeriodEnd,
      cancelAtPeriodEnd: existing.cancelAtPeriodEnd,
      canceledAt: existing.canceledAt ?? new Date(),
      stripeUpdatedAt: watermark,
    });
    if (!existing.companyId) {
      await setCardTierForMember(tx, existing.memberId, "free");
    }
  });
}

function isResourceMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "resource_missing"
  );
}
