import type { DbClient } from "@/data/db";
import { listSubscriptionsByCompanyId } from "@/data/billing";
import { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "@/data/billing-access";

/**
 * Undo the money gate when the judgement gate fails (ADR 0019).
 *
 * Since payment now precedes moderation, a rejected company may already have
 * been charged for a listing that will never be published. Holding that payment
 * is indefensible, so a rejection cancels the subscription and refunds the last
 * invoice paid for it.
 *
 * Stripe access is injected rather than imported at module scope, so the policy
 * here - which subscription counts, what happens when nothing was paid, how the
 * idempotency key is built - is unit-testable without a Stripe account or a
 * network. `productionRefundDeps` at the bottom is the real wiring.
 */

/**
 * What a refund is issued against.
 *
 * Stripe populates a PaymentIntent for anything finalized after March 2019 and
 * surfaces a bare Charge only when there is no intent behind it, so both shapes
 * have to be carried rather than assuming one.
 */
export type RefundTarget = { paymentIntentId: string } | { chargeId: string };

/** Dependency: cancels one subscription in Stripe. */
export type SubscriptionCanceller = (
  subscriptionId: string,
) => Promise<unknown>;

/**
 * Dependency: the most recent paid invoice for a subscription, or null when
 * nothing has actually been charged yet.
 */
export type LatestPaidInvoiceReader = (subscriptionId: string) => Promise<{
  invoiceId: string;
  target: RefundTarget;
  /** Integer minor units, as Stripe reports it. No float ever enters this path. */
  amountMinor: number;
} | null>;

/** Dependency: issues the refund, carrying an idempotency key Stripe honours. */
export type RefundIssuer = (
  target: RefundTarget,
  idempotencyKey: string,
) => Promise<unknown>;

export interface RefundDeps {
  cancelSubscription: SubscriptionCanceller;
  latestPaidInvoice: LatestPaidInvoiceReader;
  issueRefund: RefundIssuer;
}

export type RefundOutcome =
  /** There was a paid listing subscription; it is cancelled and the last invoice refunded. */
  | {
      outcome: "refunded";
      subscriptionId: string;
      invoiceId: string;
      amountMinor: number;
    }
  /** A live subscription existed but nothing had been charged against it yet. */
  | { outcome: "cancelled_unpaid"; subscriptionId: string }
  /** Checkout was never completed, or the subscription already ended. Nothing to undo. */
  | { outcome: "nothing_to_refund" };

/**
 * A Stripe idempotency key for the refund.
 *
 * Derived from the company and subscription rather than from the moment of the
 * click, so two moderators - or one double-click that slips past the status
 * guard - produce the same key and Stripe refunds once. Unlike the checkout key
 * this deliberately has no time bucket: a second refund is never wanted,
 * however much later it is attempted.
 */
export function refundIdempotencyKey(
  companyId: string,
  subscriptionId: string,
): string {
  return `kclub_listing_refund_${companyId}_${subscriptionId}`;
}

/**
 * Cancel and refund the listing subscription of a rejected company.
 *
 * Only a subscription whose status still grants access is acted on: one that
 * has already lapsed or been cancelled is not ours to refund again, and its
 * money question was settled when it lapsed.
 */
export async function refundListingForCompany(
  db: DbClient,
  deps: RefundDeps,
  companyId: string,
): Promise<RefundOutcome> {
  const subscriptions = await listSubscriptionsByCompanyId(db, companyId);
  const live = subscriptions.find((subscription) =>
    ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );

  if (!live) {
    return { outcome: "nothing_to_refund" };
  }

  // Cancel first. If the refund then fails, the caller retries the whole
  // operation and Stripe treats a second cancel of an already-cancelled
  // subscription as a no-op - whereas leaving it live while the refund had
  // succeeded would keep billing a company we just rejected.
  await deps.cancelSubscription(live.stripeSubscriptionId);

  const invoice = await deps.latestPaidInvoice(live.stripeSubscriptionId);
  if (!invoice) {
    return {
      outcome: "cancelled_unpaid",
      subscriptionId: live.stripeSubscriptionId,
    };
  }

  await deps.issueRefund(
    invoice.target,
    refundIdempotencyKey(companyId, live.stripeSubscriptionId),
  );

  return {
    outcome: "refunded",
    subscriptionId: live.stripeSubscriptionId,
    invoiceId: invoice.invoiceId,
    amountMinor: invoice.amountMinor,
  };
}

/**
 * The real Stripe wiring.
 *
 * Imports are dynamic because `@/env` reads secrets at module scope, and this
 * file must stay importable from a unit test that has none - the same reason
 * `modules/platform/outbox-worker.ts` resolves its Stripe client this way.
 */
export async function productionRefundDeps(): Promise<RefundDeps> {
  const [{ default: Stripe }, { env }] = await Promise.all([
    import("stripe"),
    import("@/env"),
  ]);
  const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

  return {
    cancelSubscription: (id) => stripe.subscriptions.cancel(id),

    latestPaidInvoice: async (subscriptionId) => {
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        status: "paid",
        limit: 1,
        expand: ["data.payments"],
      });

      const invoice = invoices.data[0];
      if (!invoice?.id || invoice.amount_paid <= 0) return null;

      const payment = invoice.payments?.data[0]?.payment;
      const paymentIntent = payment?.payment_intent;
      const charge = payment?.charge;

      const target: RefundTarget | null = paymentIntent
        ? {
            paymentIntentId:
              typeof paymentIntent === "string"
                ? paymentIntent
                : paymentIntent.id,
          }
        : charge
          ? { chargeId: typeof charge === "string" ? charge : charge.id }
          : null;

      // Paid but with nothing refundable attached is not a case we can handle
      // silently: treating it as "nothing was paid" would quietly keep the
      // money. The caller's retry path is the right place for it to surface.
      if (!target) {
        throw new Error(
          `invoice ${invoice.id} is paid but carries no payment intent or charge`,
        );
      }

      return {
        invoiceId: invoice.id,
        target,
        amountMinor: invoice.amount_paid,
      };
    },

    issueRefund: (target, idempotencyKey) =>
      stripe.refunds.create(
        "paymentIntentId" in target
          ? { payment_intent: target.paymentIntentId }
          : { charge: target.chargeId },
        { idempotencyKey },
      ),
  };
}
