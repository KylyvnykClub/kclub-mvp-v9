import type { DbClient } from "@/data/db";
import {
  findStripeCustomerIdByMember,
  listActiveSubscriptionsForDeletion,
} from "@/data/billing";

/** Dependency: cancels one subscription in Stripe. */
export type SubscriptionCanceller = (
  subscriptionId: string,
) => Promise<unknown>;

/** Dependency: deletes a Stripe Customer, removing its payment method and billing address. */
export type CustomerDeleter = (customerId: string) => Promise<unknown>;

/**
 * data-storage.md §4 step 4: delete the member's Stripe Customer through the
 * API. Any subscription still active is cancelled first, for a clean webhook
 * trail through the existing entitlement projection (ADR 0004) rather than
 * relying on Stripe's cascade-on-delete behaviour - that cancellation is what
 * actually unpublishes an owned company's catalogue listing, since visibility
 * is projected from the subscription's status, not a flag stored on the
 * company (data-storage.md §4 step 3's "unpublishing any that are live").
 *
 * A member who never subscribed to anything has no Stripe Customer at all;
 * this is then a no-op.
 */
export async function eraseStripeCustomerForMember(
  db: DbClient,
  deps: {
    cancelSubscription: SubscriptionCanceller;
    deleteCustomer: CustomerDeleter;
  },
  memberId: string,
): Promise<void> {
  const stripeCustomerId = await findStripeCustomerIdByMember(db, memberId);
  if (!stripeCustomerId) {
    return;
  }

  const activeSubscriptions = await listActiveSubscriptionsForDeletion(
    db,
    memberId,
  );

  for (const subscription of activeSubscriptions) {
    await deps.cancelSubscription(subscription.stripeSubscriptionId);
  }

  await deps.deleteCustomer(stripeCustomerId);
}
