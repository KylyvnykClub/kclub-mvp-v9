import type Stripe from "stripe";

import { listSubscriptionsByCompanyId } from "@/data/billing";
import type { DbClient } from "@/data/db";
import { LISTING_PUBLISHABLE_STATUSES } from "@/domain/subscription-access";

/**
 * Ending a listing's billing from the partner's side (ADR 0044 §4, §5).
 *
 * - **Cancel auto-renewal** sets `cancel_at_period_end`. In the free month the
 *   period end is `trial_end`, so Stripe ends the subscription there without
 *   an invoice and the listing stays up until then. After payment it ends at
 *   the paid period's end. Nothing about the remaining access is kept here:
 *   the subscription stays `trialing`/`active` until Stripe ends it, and the
 *   projection follows (ADR 0004).
 * An EU withdrawal ends a listing at once instead; it goes through the
 * rejection's refund path (`refund.ts`), which cancels a trialing or paid
 * subscription and refunds what was paid.
 *
 * It is idempotent: a second call finds nothing left to do, and the
 * Stripe calls carry keys derived from the subscription.
 */

export interface ListingCancellationDeps {
  /**
   * No idempotency key: setting `cancel_at_period_end` is idempotent by
   * itself, and a fixed key would replay an old answer after the renewal was
   * resumed and cancelled again - reporting a cancellation that did not
   * happen.
   */
  updateSubscription: (
    id: string,
    params: Stripe.SubscriptionUpdateParams,
  ) => Promise<Stripe.Subscription>;
  cancelSubscription: (
    id: string,
    idempotencyKey: string,
  ) => Promise<Stripe.Subscription>;
}

export type RenewalCancellation =
  | { outcome: "cancelled"; subscriptionId: string; endsAt: Date }
  | { outcome: "already_cancelled"; subscriptionId: string; endsAt: Date }
  | { outcome: "nothing_to_cancel" };

/** The listing subscription that would bill again, if there is one. */
async function liveListingSubscription(db: DbClient, companyId: string) {
  const subscriptions = await listSubscriptionsByCompanyId(db, companyId);
  return (
    subscriptions.find((subscription) =>
      LISTING_PUBLISHABLE_STATUSES.includes(subscription.status),
    ) ?? null
  );
}

function periodEndOf(subscription: Stripe.Subscription): Date {
  const end =
    subscription.cancel_at ??
    subscription.trial_end ??
    subscription.items.data[0]?.current_period_end ??
    null;
  if (!end) {
    throw new Error(`Subscription ${subscription.id} has no period end`);
  }
  return new Date(end * 1000);
}

export async function cancelListingRenewal(
  db: DbClient,
  stripe: ListingCancellationDeps,
  companyId: string,
): Promise<RenewalCancellation> {
  const live = await liveListingSubscription(db, companyId);
  if (!live) return { outcome: "nothing_to_cancel" };

  if (live.cancelAtPeriodEnd) {
    return {
      outcome: "already_cancelled",
      subscriptionId: live.stripeSubscriptionId,
      endsAt: live.cancelAtPeriodEnd,
    };
  }

  const updated = await stripe.updateSubscription(live.stripeSubscriptionId, {
    cancel_at_period_end: true,
    proration_behavior: "none",
  });

  return {
    outcome: "cancelled",
    subscriptionId: updated.id,
    endsAt: periodEndOf(updated),
  };
}

export async function productionListingCancellationDeps(): Promise<ListingCancellationDeps> {
  const [{ default: StripeClient }, { env }] = await Promise.all([
    import("stripe"),
    import("@/env"),
  ]);
  const stripe = new StripeClient(env.server.STRIPE_SECRET_KEY);
  return {
    updateSubscription: (id, params) => stripe.subscriptions.update(id, params),
    cancelSubscription: (id, idempotencyKey) =>
      stripe.subscriptions.cancel(
        id,
        { invoice_now: false, prorate: false },
        { idempotencyKey },
      ),
  };
}
