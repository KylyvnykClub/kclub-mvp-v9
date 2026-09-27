import type Stripe from "stripe";

import type { DbClient } from "@/data/db";
import { listSubscriptionsByCompanyId } from "@/data/billing";
import { ACCESS_GRANTING_SUBSCRIPTION_STATUSES } from "@/data/billing-access";
import { findCompanyById } from "@/data/companies";
import { enqueueOutbox } from "@/data/outbox";
import {
  findListingHold,
  listListingHoldsByCompany,
  markListingHoldCaptureRequested,
  markListingHoldRefunded,
  setListingHoldSubscription,
  upsertListingHold,
  type ListingHoldRow,
} from "@/data/listing-holds";
import {
  addOneMonth,
  holdPaysForListing,
  partnerPaymentStanding,
  planListingHoldSettlement,
  type ListingHoldAction,
  type PartnerPaymentStanding,
} from "@/domain/listing-hold";

/**
 * A business partner's first payment: held on the card at application,
 * captured when a moderator approves, released when one rejects (ADR 0037).
 *
 * The order of events is the whole point, so here it is once:
 *
 * 1. The applicant completes a Stripe Checkout session in `payment` mode whose
 *    PaymentIntent has `capture_method = manual` and saves the card for later
 *    (`setup_future_usage = off_session`). Stripe authorises the price and the
 *    PaymentIntent waits in `requires_capture`. Nothing is charged.
 * 2. `payment_intent.amount_capturable_updated` arrives; the projection below
 *    re-reads the PaymentIntent from Stripe and records the hold.
 * 3. **Approve** sets the moderation status and asks Stripe to capture. That
 *    is all it does - it does not publish anything and it does not mark
 *    anything paid.
 * 4. `payment_intent.succeeded` arrives; the projection re-reads the
 *    PaymentIntent, and only now does the hold carry `captured_at` and
 *    `covers_until`. That is what publishes the listing (FR-044) and opens the
 *    club to the partner (FR-110). Stripe emails the receipt to the address
 *    the PaymentIntent names.
 * 5. The same projection starts the monthly subscription from the saved card,
 *    anchored to the end of the month just paid for, so the next charge is a
 *    month away and every charge after it is an ordinary invoice.
 *
 * **Reject** sets the status and cancels the authorisation. If the capture
 * fails or the authorisation lapses before anyone approves, the PaymentIntent
 * is not `succeeded`, so nothing is published and the partner is asked for the
 * card again.
 *
 * Stripe is injected, for the same reason `refund.ts` injects it: the policy
 * must be testable without an account or a network. `productionListingHoldDeps`
 * at the bottom is the real wiring.
 */

/** Marks the PaymentIntents this module owns, so the webhook routes only these. */
export const LISTING_HOLD_KIND = "listing_hold";

/** Outbox topic: re-read one PaymentIntent and fold it (from the webhook). */
export const LISTING_HOLD_SYNC_TOPIC = "billing.listing_hold.sync";

/** Outbox topic: settle a company's holds again after Stripe was unreachable. */
export const LISTING_HOLD_SETTLE_TOPIC = "billing.listing_hold.settle";

/** The `payment_intent.*` events that can change a hold. */
export const LISTING_HOLD_EVENTS: readonly string[] = [
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.processing",
  // A refund made outside our reject flow - in the Stripe dashboard - keeps
  // the PaymentIntent `succeeded`; only the charge says the money went back.
  "charge.refunded",
];

export interface ListingHoldDeps {
  createCheckoutSession: (
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ) => Promise<{ url: string | null }>;
  retrievePrice: (priceId: string) => Promise<Stripe.Price>;
  /** With `latest_charge` expanded: the capture deadline lives on the charge. */
  retrievePaymentIntent: (id: string) => Promise<Stripe.PaymentIntent>;
  capturePaymentIntent: (
    id: string,
    idempotencyKey: string,
  ) => Promise<unknown>;
  cancelPaymentIntent: (id: string, idempotencyKey: string) => Promise<unknown>;
  refundPaymentIntent: (id: string, idempotencyKey: string) => Promise<unknown>;
  createSubscription: (
    params: Stripe.SubscriptionCreateParams,
    idempotencyKey: string,
  ) => Promise<{ id: string }>;
  /** The listing plan's Stripe Price (FR-059: the staff-set price wins). */
  listingPriceId: (db: DbClient) => Promise<string>;
}

/**
 * Idempotency keys derived from the PaymentIntent alone: whoever asks, however
 * many times, Stripe performs each of these once. No time bucket - a second
 * capture or a second subscription is never wanted, however much later.
 */
export function listingHoldIdempotencyKey(
  operation: "capture" | "cancel" | "refund" | "subscription",
  paymentIntentId: string,
): string {
  return `kclub_listing_hold_${operation}_${paymentIntentId}`;
}

/** One session per company per minute, so a double click opens one checkout. */
export function listingHoldCheckoutKey(companyId: string, now: Date): string {
  return `kclub_listing_hold_checkout_${companyId}_${Math.floor(now.getTime() / 60_000)}`;
}

function isUnexpectedState(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "payment_intent_unexpected_state"
  );
}

function idOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function listingSubscriptionActive(
  db: DbClient,
  companyId: string,
): Promise<boolean> {
  const subscriptions = await listSubscriptionsByCompanyId(db, companyId);
  return subscriptions.some((subscription) =>
    ACCESS_GRANTING_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );
}

// ─── The partner's side: open a checkout that holds the price ────────────────

export type OpenHoldCheckoutResult =
  | { outcome: "opened"; url: string }
  /** Already held, already paid, or rejected: there is nothing to ask for. */
  | { outcome: "not_needed"; standing: PartnerPaymentStanding };

export async function openListingHoldCheckout(
  db: DbClient,
  stripe: ListingHoldDeps,
  input: {
    memberId: string;
    companyId: string;
    stripeCustomerId: string;
    receiptEmail: string | null;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    now: Date;
  },
): Promise<OpenHoldCheckoutResult> {
  const company = await findCompanyById(db, input.companyId);
  if (!company || company.ownerId !== input.memberId) {
    throw new Error("Company not found for this member");
  }

  const { standing } = await partnerStandingFor(db, company, input.now);
  if (standing !== "authorise" && standing !== "pay") {
    return { outcome: "not_needed", standing };
  }

  // The hold is for exactly what the subscription will bill, read from the
  // same Stripe Price rather than from a number of our own. Money is integer
  // minor units end to end.
  const price = await stripe.retrievePrice(input.priceId);
  const product = idOf(price.product);
  if (price.unit_amount === null || !product) {
    throw new Error(`Price ${input.priceId} has no fixed amount`);
  }

  const metadata = {
    kind: LISTING_HOLD_KIND,
    memberId: input.memberId,
    companyId: input.companyId,
  };

  const session = await stripe.createCheckoutSession(
    {
      mode: "payment",
      customer: input.stripeCustomerId,
      // `card` includes Apple Pay and Google Pay wallets in Checkout. Methods
      // that cannot be captured later (bank redirects) are not offered.
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: price.currency,
            unit_amount: price.unit_amount,
            product,
          },
        },
      ],
      payment_intent_data: {
        capture_method: "manual",
        setup_future_usage: "off_session",
        ...(input.receiptEmail ? { receipt_email: input.receiptEmail } : {}),
        description: `KCLUB partner listing: ${company.name}`,
        metadata,
      },
      metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    listingHoldCheckoutKey(input.companyId, input.now),
  );

  if (!session.url) {
    throw new Error("Stripe returned a checkout session without a url");
  }

  return { outcome: "opened", url: session.url };
}

export async function partnerStandingFor(
  db: DbClient,
  company: { id: string; moderationStatus: string },
  now: Date,
): Promise<{ standing: PartnerPaymentStanding; holds: ListingHoldRow[] }> {
  const [holds, subscriptionActive] = await Promise.all([
    listListingHoldsByCompany(db, company.id),
    listingSubscriptionActive(db, company.id),
  ]);

  return {
    standing: partnerPaymentStanding({
      moderationStatus: company.moderationStatus,
      holds,
      listingSubscriptionActive: subscriptionActive,
      now,
    }),
    holds,
  };
}

// ─── The webhook's side: project a PaymentIntent ─────────────────────────────

export type HoldProjectionResult = "applied" | "stale" | "ignored";

/**
 * Re-read one PaymentIntent from Stripe and fold it into `listing_holds`, then
 * bring the company's holds in line with its moderation status.
 *
 * The payload that triggered this is never read for state: a forged event
 * with a valid signature still cannot record a capture Stripe does not report
 * (integration.md §4). `eventCreated` orders deliveries (FR-053).
 */
export async function projectListingHold(
  db: DbClient,
  stripe: ListingHoldDeps,
  paymentIntentId: string,
  eventCreated: number,
  now: Date,
): Promise<HoldProjectionResult> {
  const intent = await stripe.retrievePaymentIntent(paymentIntentId);
  const { kind, companyId, memberId } = intent.metadata ?? {};

  if (kind !== LISTING_HOLD_KIND || !companyId || !memberId) {
    return "ignored";
  }

  const customerId = idOf(intent.customer);
  const company = await findCompanyById(db, companyId);

  if (!company || !customerId) {
    // The company was deleted after the checkout opened. There is no row to
    // attach the hold to, and nothing it could ever pay for: release it.
    await cancelQuietly(stripe, intent.id, intent.status);
    return "ignored";
  }

  const existing = await findListingHold(db, intent.id);
  const watermark = new Date(eventCreated * 1000);
  const charge =
    intent.latest_charge && typeof intent.latest_charge !== "string"
      ? intent.latest_charge
      : null;

  const captureBeforeUnix =
    charge?.payment_method_details?.card?.capture_before ?? null;

  // Stripe does not stamp the moment of capture on the objects we read. The
  // approval recorded when it asked for the capture, which is the moment the
  // capture happened; failing that (a capture made in the Stripe dashboard),
  // the event clock. Not the event clock first: a late-drained older event
  // can be the first to see `succeeded`, and its clock is the authorisation's
  // - up to a week early, which would move the paid month and the first
  // renewal forward with it.
  const capturedAt =
    intent.status === "succeeded"
      ? (existing?.capturedAt ?? existing?.captureRequestedAt ?? watermark)
      : null;
  const refundedAt = charge?.refunded
    ? (existing?.refundedAt ?? watermark)
    : (existing?.refundedAt ?? null);

  const written = await upsertListingHold(db, {
    stripePaymentIntentId: intent.id,
    companyId,
    memberId,
    stripeCustomerId: customerId,
    status: intent.status,
    amountMinor: intent.amount,
    currency: intent.currency,
    captureBefore: captureBeforeUnix
      ? new Date(captureBeforeUnix * 1000)
      : null,
    capturedAt,
    coversUntil: capturedAt ? addOneMonth(capturedAt) : null,
    refundedAt,
    stripeUpdatedAt: watermark,
  });

  // A capture that lands after the company was rejected: the moderator
  // approved, Stripe captured at once, and a rejection followed before this
  // event arrived. Its cancel was refused (the money had already moved), so
  // the money goes back now. Only on the transition into `succeeded` - a
  // listing that was live and is hidden afterwards keeps its paid month.
  const newlyCaptured =
    intent.status === "succeeded" && existing?.status !== "succeeded";
  if (
    newlyCaptured &&
    company.moderationStatus === "rejected" &&
    refundedAt === null
  ) {
    await stripe.refundPaymentIntent(
      intent.id,
      listingHoldIdempotencyKey("refund", intent.id),
    );
    await markListingHoldRefunded(db, intent.id, now);
  }

  // Settle even when this delivery was stale: the state it would have written
  // is already there, and settling is idempotent. In a savepoint and caught:
  // Stripe being unreachable while starting the subscription must not roll
  // back the record of a capture Stripe has already confirmed - that record is
  // what publishes the listing the partner has paid for. The settlement is
  // queued and retried instead.
  try {
    await db.transaction((savepoint) =>
      settleListingHolds(savepoint, stripe, companyId, now),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[listing-hold] settlement after ${intent.id} failed, queued: ${message}`,
    );
    await enqueueOutbox(db, LISTING_HOLD_SETTLE_TOPIC, { companyId });
  }

  return written ? "applied" : "stale";
}

// ─── Both sides: make the holds agree with the moderation decision ───────────

export interface SettlementReport {
  actions: ListingHoldAction[];
  /** A capture was asked for. Not a payment - Stripe confirms that by webhook. */
  captureRequested: boolean;
}

/**
 * Carry out `planListingHoldSettlement` for one company.
 *
 * Called by the approve and reject buttons, by the webhook projection and by
 * the outbox retry, and safe to call from all of them at once: the plan
 * describes an end state, and every Stripe call carries a key derived from the
 * PaymentIntent. Throws when Stripe is unreachable, so the caller can queue a
 * retry; a PaymentIntent that is no longer in the state the plan expected
 * (it lapsed, it was cancelled in the dashboard) is not an error, it is the
 * next webhook's news.
 */
export async function settleListingHolds(
  db: DbClient,
  stripe: ListingHoldDeps,
  companyId: string,
  now: Date,
): Promise<SettlementReport> {
  const [company, holds, subscriptionActive] = await Promise.all([
    findCompanyById(db, companyId),
    listListingHoldsByCompany(db, companyId),
    listingSubscriptionActive(db, companyId),
  ]);

  const actions = planListingHoldSettlement({
    moderationStatus: company?.moderationStatus ?? null,
    holds,
    listingSubscriptionActive: subscriptionActive,
    now,
  });

  let captureRequested = false;

  for (const action of actions) {
    const hold = holds.find(
      (h) => h.stripePaymentIntentId === action.paymentIntentId,
    );

    if (action.kind === "capture") {
      // Recorded before the call, so a retry after a timeout chooses this
      // same hold rather than a newer one.
      await markListingHoldCaptureRequested(db, action.paymentIntentId, now);
      try {
        await stripe.capturePaymentIntent(
          action.paymentIntentId,
          listingHoldIdempotencyKey("capture", action.paymentIntentId),
        );
        captureRequested = true;
      } catch (error) {
        // Lapsed or cancelled since we last heard: nothing to capture, and
        // nothing is published. The partner is asked for the card again.
        if (!isUnexpectedState(error)) throw error;
      }
    } else if (action.kind === "cancel") {
      await cancelQuietly(stripe, action.paymentIntentId, hold?.status ?? null);
    } else if (hold) {
      await startListingSubscription(db, stripe, hold, now);
    }
  }

  return { actions, captureRequested };
}

async function cancelQuietly(
  stripe: ListingHoldDeps,
  paymentIntentId: string,
  status: string | null,
): Promise<void> {
  if (status === "canceled" || status === "succeeded") return;
  try {
    await stripe.cancelPaymentIntent(
      paymentIntentId,
      listingHoldIdempotencyKey("cancel", paymentIntentId),
    );
  } catch (error) {
    if (!isUnexpectedState(error)) throw error;
  }
}

/**
 * The monthly subscription, from the card the hold saved (FR-116).
 *
 * Anchored to the end of the month the captured amount paid for, with no
 * proration, so Stripe bills nothing until then and bills the listing price
 * every month after - `charge_automatically`, an invoice and a receipt each
 * time. A failed renewal is the ordinary dunning path (FR-056): `past_due`
 * keeps the listing up while Stripe retries, and a lapse unpublishes it.
 */
async function startListingSubscription(
  db: DbClient,
  stripe: ListingHoldDeps,
  hold: ListingHoldRow,
  now: Date,
): Promise<void> {
  if (!holdPaysForListing(hold, now) || !hold.coversUntil) return;

  const intent = await stripe.retrievePaymentIntent(hold.stripePaymentIntentId);
  const paymentMethod = idOf(intent.payment_method);
  if (!paymentMethod) {
    throw new Error(
      `PaymentIntent ${hold.stripePaymentIntentId} succeeded without a saved payment method`,
    );
  }

  const priceId = await stripe.listingPriceId(db);

  // An anchor must lie in the future. If the paid month is all but over -
  // only when this ran very late, after a long outage - bill from now.
  const anchorSeconds = Math.floor(hold.coversUntil.getTime() / 1000);
  const anchorUsable =
    hold.coversUntil.getTime() - now.getTime() > 60 * 60 * 1000;

  const subscription = await stripe.createSubscription(
    {
      customer: hold.stripeCustomerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethod,
      collection_method: "charge_automatically",
      off_session: true,
      ...(anchorUsable
        ? { billing_cycle_anchor: anchorSeconds, proration_behavior: "none" }
        : {}),
      metadata: {
        memberId: hold.memberId,
        companyId: hold.companyId,
        listingHoldPaymentIntentId: hold.stripePaymentIntentId,
      },
    },
    listingHoldIdempotencyKey("subscription", hold.stripePaymentIntentId),
  );

  await setListingHoldSubscription(
    db,
    hold.stripePaymentIntentId,
    subscription.id,
  );
}

/**
 * Give back a captured first payment, for a listing rejected after it went
 * live (ADR 0037). The subscription half is `refund.ts`; this is the hold.
 * Returns what was refunded, empty when there was nothing to refund.
 */
export async function refundCapturedListingHolds(
  db: DbClient,
  stripe: ListingHoldDeps,
  companyId: string,
  now: Date,
): Promise<{ paymentIntentId: string; amountMinor: number }[]> {
  const holds = await listListingHoldsByCompany(db, companyId);
  const refunded: { paymentIntentId: string; amountMinor: number }[] = [];

  for (const hold of holds) {
    if (!holdPaysForListing(hold, now)) continue;

    await stripe.refundPaymentIntent(
      hold.stripePaymentIntentId,
      listingHoldIdempotencyKey("refund", hold.stripePaymentIntentId),
    );
    // Written from our side rather than waiting for a webhook, because it
    // only ever takes access away: money back means the listing is unpaid.
    await markListingHoldRefunded(db, hold.stripePaymentIntentId, now);
    refunded.push({
      paymentIntentId: hold.stripePaymentIntentId,
      amountMinor: hold.amountMinor,
    });
  }

  return refunded;
}

/**
 * The real Stripe wiring. Imports are dynamic because `@/env` reads secrets at
 * module scope, and this file must stay importable from a test that has none.
 */
export async function productionListingHoldDeps(): Promise<ListingHoldDeps> {
  const [{ default: StripeClient }, { env }, { checkoutPriceIdForPlan }] =
    await Promise.all([import("stripe"), import("@/env"), import("./prices")]);
  const stripe = new StripeClient(env.server.STRIPE_SECRET_KEY);

  return {
    createCheckoutSession: (params, idempotencyKey) =>
      stripe.checkout.sessions.create(params, { idempotencyKey }),
    retrievePrice: (priceId) => stripe.prices.retrieve(priceId),
    retrievePaymentIntent: (id) =>
      stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] }),
    capturePaymentIntent: (id, idempotencyKey) =>
      stripe.paymentIntents.capture(id, {}, { idempotencyKey }),
    cancelPaymentIntent: (id, idempotencyKey) =>
      stripe.paymentIntents.cancel(id, {}, { idempotencyKey }),
    refundPaymentIntent: (id, idempotencyKey) =>
      stripe.refunds.create({ payment_intent: id }, { idempotencyKey }),
    createSubscription: (params, idempotencyKey) =>
      stripe.subscriptions.create(params, { idempotencyKey }),
    listingPriceId: (db) => checkoutPriceIdForPlan(db, "listing"),
  };
}
