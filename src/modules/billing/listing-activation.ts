import type Stripe from "stripe";

import {
  findListingActivation,
  hasPaymentAuthority,
  listActivationsDueForStart,
  updateListingActivation,
  type ListingActivationRow,
} from "@/data/business-applications";
import { findCompanyById } from "@/data/companies";
import {
  findStripeCustomerIdByMember,
  listSubscriptionsByCompanyId,
} from "@/data/billing";
import { listListingHoldsByCompany } from "@/data/listing-holds";
import type { DbClient } from "@/data/db";
import { enqueueOutbox } from "@/data/outbox";
import {
  addOneMonth,
  holdIsCapturable,
  holdPaysForListing,
} from "@/domain/listing-hold";

/**
 * A listing paid by a saved card (ADR 0044): the invite route's free month,
 * and an EU consumer's deferred start. The counterpart of `listing-hold.ts`,
 * which holds the price at application; this one charges nothing until the
 * listing is published.
 *
 * The order of events:
 *
 * 1. With the payment authority on record (the gate below), the owner
 *    completes a Checkout session in `setup` mode. Stripe saves the card to the
 *    owner's Customer. Nothing is charged.
 * 2. `checkout.session.completed` / `setup_intent.succeeded` arrive. The
 *    projection re-reads the session and its SetupIntent from Stripe, checks
 *    the mode, the Customer, the company and `succeeded`, and records the
 *    payment method. The application now counts as ready for review.
 * 3. A moderator approves. `settleListingActivation` (called by the approval,
 *    the webhook, the outbox retry and the daily sweep) checks it all again -
 *    approved, not withdrawn, card saved, consent on record, no subscription
 *    yet, an EU start date passed - writes `published_at` first, and creates
 *    the subscription with `trial_end` one calendar month later for the
 *    invite route. Its idempotency key is the company, so a retry cannot
 *    start a second one.
 * 4. `customer.subscription.created` is projected as for any subscription.
 *    `trialing` publishes the listing (LISTING_PUBLISHABLE_STATUSES); Stripe
 *    invoices $19.99 at `trial_end` and every month after.
 */

/** Marks the Checkout sessions and SetupIntents this module owns. */
export const LISTING_SETUP_KIND = "listing_setup";

/** Outbox topic: re-read one company's setup session and fold it. */
export const LISTING_ACTIVATION_SYNC_TOPIC = "billing.listing_activation.sync";

/**
 * Outbox topic: a subscription or invoice event the activation cares about -
 * the free month ending, the first real payment, a payment that needs the
 * cardholder (`listing-activation-events.ts`).
 */
export const LISTING_ACTIVATION_EVENT_TOPIC =
  "billing.listing_activation.event";

/** Outbox topic: try to start a company's subscription again. */
export const LISTING_ACTIVATION_SETTLE_TOPIC =
  "billing.listing_activation.settle";

export interface ListingActivationDeps {
  createCheckoutSession: (
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ) => Promise<{ id: string; url: string | null }>;
  /** With `setup_intent` expanded. */
  retrieveCheckoutSession: (id: string) => Promise<Stripe.Checkout.Session>;
  createSubscription: (
    params: Stripe.SubscriptionCreateParams,
    idempotencyKey: string,
  ) => Promise<{ id: string; trial_end: number | null }>;
  listingPriceId: (db: DbClient) => Promise<string>;
  /**
   * The Customer's subscriptions as Stripe has them now, for the "check
   * Stripe first" step before a start: a subscription created by an attempt
   * whose result never reached us must be found, not duplicated.
   */
  listCustomerSubscriptions: (customerId: string) => Promise<
    {
      id: string;
      status: string;
      trial_end: number | null;
      metadata: Record<string, string>;
    }[]
  >;
  retrieveSetupIntent: (id: string) => Promise<Stripe.SetupIntent>;
}

/** Statuses after which a subscription bills nothing more. */
const ENDED_SUBSCRIPTION_STATUSES = ["canceled", "incomplete_expired"];

/**
 * Whether this company already has a way of paying for its listing: a live
 * listing subscription, a reservation that can still be captured, or a captured
 * month still running. A saved-card start must never sit beside any of these,
 * or the listing is billed twice.
 */
async function companyAlreadyBilled(
  db: DbClient,
  companyId: string,
  now: Date,
): Promise<boolean> {
  const [subscriptions, holds] = await Promise.all([
    listSubscriptionsByCompanyId(db, companyId),
    listListingHoldsByCompany(db, companyId),
  ]);
  return (
    subscriptions.some(
      (subscription) =>
        !ENDED_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
        subscription.status !== "deleted" &&
        subscription.status !== "unpaid",
    ) ||
    holds.some(
      (hold) => holdIsCapturable(hold, now) || holdPaysForListing(hold, now),
    )
  );
}

function idOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function listingActivationKey(
  operation: "checkout" | "subscription",
  companyId: string,
  now?: Date,
): string {
  // The checkout key carries a minute bucket so a double click opens one
  // session but a return next day opens a fresh one; the subscription key has
  // none - a second subscription is never wanted.
  const bucket =
    operation === "checkout" && now
      ? `_${Math.floor(now.getTime() / 60_000)}`
      : "";
  return `kclub_listing_activation_${operation}_${companyId}${bucket}`;
}

// ─── The owner's side: save a card ───────────────────────────────────────────

export type OpenSetupCheckoutResult =
  | { outcome: "opened"; url: string }
  | { outcome: "not_needed" }
  | { outcome: "consent_missing" };

export async function openListingSetupCheckout(
  db: DbClient,
  stripe: ListingActivationDeps,
  input: {
    memberId: string;
    companyId: string;
    stripeCustomerId: string;
    successUrl: string;
    cancelUrl: string;
    now: Date;
  },
): Promise<OpenSetupCheckoutResult> {
  const [company, activation] = await Promise.all([
    findCompanyById(db, input.companyId),
    findListingActivation(db, input.companyId),
  ]);
  if (
    !company ||
    company.ownerId !== input.memberId ||
    !activation ||
    activation.memberId !== input.memberId
  ) {
    throw new Error("Company not found for this member");
  }
  if (
    activation.cardSavedAt ||
    company.withdrawnAt ||
    company.moderationStatus === "rejected" ||
    (await companyAlreadyBilled(db, company.id, input.now))
  ) {
    return { outcome: "not_needed" };
  }

  // ADR 0044 §2: no Checkout without the payment authority for this route.
  const wording = activation.route === "invite" ? "invite" : "public_setup";
  if (!(await hasPaymentAuthority(db, company.id, input.memberId, wording))) {
    return { outcome: "consent_missing" };
  }

  const metadata = {
    kind: LISTING_SETUP_KIND,
    companyId: company.id,
    memberId: input.memberId,
  };

  const session = await stripe.createCheckoutSession(
    {
      mode: "setup",
      currency: "usd",
      customer: input.stripeCustomerId,
      payment_method_types: ["card"],
      client_reference_id: company.id,
      // The country of residence and, where it applies, the state - asked by
      // Stripe on the card form rather than by us (ADR 0044 §1).
      billing_address_collection: "required",
      metadata,
      setup_intent_data: {
        metadata,
        description: `KCLUB partner listing: ${company.name}`,
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    listingActivationKey("checkout", company.id, input.now),
  );

  if (!session.url) {
    throw new Error("Stripe returned a checkout session without a url");
  }

  await updateListingActivation(db, company.id, {
    stripeCustomerId: input.stripeCustomerId,
    setupCheckoutSessionId: session.id,
  });

  return { outcome: "opened", url: session.url };
}

// ─── The webhook's side: project the saved card ──────────────────────────────

export type SetupProjectionResult = "applied" | "stale" | "ignored";

/**
 * Re-read a setup session from Stripe and record the card it saved. Nothing in
 * the event payload is trusted but the session id: the mode, Customer,
 * company and SetupIntent status all come from the API (ADR 0004).
 */
export async function projectListingSetup(
  db: DbClient,
  stripe: ListingActivationDeps,
  checkoutSessionId: string,
  eventCreated: number,
  now: Date,
): Promise<SetupProjectionResult> {
  const session = await stripe.retrieveCheckoutSession(checkoutSessionId);
  if (session.mode !== "setup") return "ignored";
  const setupIntent =
    session.setup_intent && typeof session.setup_intent !== "string"
      ? session.setup_intent
      : null;
  return recordSavedCard(db, stripe, {
    kind: session.metadata?.kind,
    companyId: session.metadata?.companyId,
    customerId: idOf(session.customer),
    setupIntent,
    sessionId: session.id,
    now,
  });
}

/**
 * The same, from `setup_intent.succeeded`: the SetupIntent is re-read and
 * carries the application's metadata itself, so the session it came from
 * does not have to be found - which matters when the owner opened several.
 */
export async function projectListingSetupIntent(
  db: DbClient,
  stripe: ListingActivationDeps,
  setupIntentId: string,
  now: Date,
): Promise<SetupProjectionResult> {
  const setupIntent = await stripe.retrieveSetupIntent(setupIntentId);
  return recordSavedCard(db, stripe, {
    kind: setupIntent.metadata?.kind,
    companyId: setupIntent.metadata?.companyId,
    customerId: idOf(setupIntent.customer),
    setupIntent,
    sessionId: null,
    now,
  });
}

async function recordSavedCard(
  db: DbClient,
  stripe: ListingActivationDeps,
  input: {
    kind: string | undefined;
    companyId: string | undefined;
    customerId: string | null;
    setupIntent: Stripe.SetupIntent | null;
    sessionId: string | null;
    now: Date;
  },
): Promise<SetupProjectionResult> {
  const { companyId, setupIntent, now } = input;
  if (input.kind !== LISTING_SETUP_KIND || !companyId) return "ignored";

  const activation = await findListingActivation(db, companyId);
  if (!activation) return "ignored";

  // "Card saved" only ever moves one way, so it is not ordered by event time:
  // a newer event about an abandoned session must not hide an older event
  // about the one that succeeded. Once saved, later deliveries change nothing.
  if (activation.cardSavedAt) return "stale";

  // The card must belong to this application's owner: the Customer the
  // checkout was opened for, or - if that write was lost - the owner's own.
  const expectedCustomer =
    activation.stripeCustomerId ??
    (await findStripeCustomerIdByMember(db, activation.memberId));
  if (!input.customerId || input.customerId !== expectedCustomer) {
    return "ignored";
  }

  const paymentMethodId = idOf(setupIntent?.payment_method);
  if (!setupIntent || setupIntent.status !== "succeeded" || !paymentMethodId) {
    return "ignored";
  }

  await updateListingActivation(db, companyId, {
    stripeCustomerId: input.customerId,
    ...(input.sessionId ? { setupCheckoutSessionId: input.sessionId } : {}),
    setupIntentId: setupIntent.id,
    paymentMethodId,
    cardSavedAt: now,
    stripeUpdatedAt: now,
  });

  // The card can arrive after the approval; start now if everything else is
  // ready. A failure is retried, never lost: the card record stands.
  try {
    await db.transaction((savepoint) =>
      settleListingActivation(savepoint, stripe, companyId, now),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[listing-activation] start for ${companyId} failed, queued: ${message}`,
    );
    await enqueueOutbox(db, LISTING_ACTIVATION_SETTLE_TOPIC, { companyId });
  }

  return "applied";
}

// ─── Both sides: start the subscription at publication ───────────────────────

export type ActivationOutcome =
  "started" | "already_started" | "not_ready" | "not_applicable";

/** Why a start is not due, as a pure answer - the one place the rule lives. */
export function activationDue(
  activation: Pick<
    ListingActivationRow,
    "paymentMethodId" | "stripeSubscriptionId" | "startNotBefore"
  >,
  company: { moderationStatus: string; withdrawnAt: Date | null },
  consentOnRecord: boolean,
  now: Date,
): boolean {
  return (
    !activation.stripeSubscriptionId &&
    company.moderationStatus === "approved" &&
    company.withdrawnAt === null &&
    activation.paymentMethodId !== null &&
    consentOnRecord &&
    (activation.startNotBefore === null || activation.startNotBefore <= now)
  );
}

/**
 * Start the listing subscription if, and only if, every condition holds now.
 * Safe to call from anywhere at any time; throws only when Stripe is
 * unreachable, so the caller can queue a retry.
 */
export async function settleListingActivation(
  db: DbClient,
  stripe: ListingActivationDeps,
  companyId: string,
  now: Date,
): Promise<ActivationOutcome> {
  const [company, activation] = await Promise.all([
    findCompanyById(db, companyId),
    findListingActivation(db, companyId),
  ]);
  if (!company || !activation) return "not_applicable";
  if (activation.stripeSubscriptionId) return "already_started";
  // A hold or a subscription already pays for this listing (a route changed
  // after filing, or a start whose answer was lost): never a second one.
  if (await companyAlreadyBilled(db, companyId, now)) return "not_applicable";

  const wording = activation.route === "invite" ? "invite" : "public_setup";
  const consent = await hasPaymentAuthority(
    db,
    companyId,
    activation.memberId,
    wording,
  );
  if (!activationDue(activation, company, consent, now)) return "not_ready";

  // Written before Stripe is asked: the operation's log. A retry after a
  // timeout keeps this moment, so the free month is counted from the first
  // attempt at publication, not from whenever a retry succeeded.
  const publishedAt = activation.publishedAt ?? now;
  if (!activation.publishedAt) {
    await updateListingActivation(db, companyId, { publishedAt });
  }

  // Check Stripe first: an earlier attempt may have created the subscription
  // and then lost its answer (a timeout, a rolled-back transaction). Adopt it
  // instead of creating another.
  const existing = (
    await stripe.listCustomerSubscriptions(activation.stripeCustomerId!)
  ).find(
    (subscription) =>
      subscription.metadata.companyId === companyId &&
      !ENDED_SUBSCRIPTION_STATUSES.includes(subscription.status),
  );
  if (existing) {
    await updateListingActivation(db, companyId, {
      stripeSubscriptionId: existing.id,
      trialEndsAt: existing.trial_end
        ? new Date(existing.trial_end * 1000)
        : null,
    });
    return "already_started";
  }

  const trialEnd = activation.freeMonth ? addOneMonth(publishedAt) : null;
  const metadata = {
    memberId: activation.memberId,
    companyId,
    kind: LISTING_SETUP_KIND,
  };

  const subscription = await stripe.createSubscription(
    {
      customer: activation.stripeCustomerId!,
      items: [{ price: await stripe.listingPriceId(db), quantity: 1 }],
      default_payment_method: activation.paymentMethodId!,
      collection_method: "charge_automatically",
      off_session: true,
      ...(trialEnd
        ? {
            trial_end: Math.floor(trialEnd.getTime() / 1000),
            // No card left at the end of the free month: end the listing,
            // never invoice into the void.
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" },
            },
          }
        : {}),
      metadata,
    },
    listingActivationKey("subscription", companyId),
  );

  await updateListingActivation(db, companyId, {
    stripeSubscriptionId: subscription.id,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
  });
  // The publication email - exact dates, amount, the way to cancel - goes out
  // from the outbox, after this commits.
  await enqueueOutbox(db, LISTING_ACTIVATION_EVENT_TOPIC, {
    type: "published",
    companyId,
  });

  return "started";
}

/**
 * The daily sweep (ADR 0044 §5): an EU consumer's 14 days have passed, or a
 * start failed and its retry was lost. Each company is its own savepoint, so
 * one Stripe failure does not stop the rest; a failure is queued for retry.
 */
export async function startDueListingActivations(
  db: DbClient,
  stripe: ListingActivationDeps,
  now: Date,
): Promise<{ started: number; failed: number }> {
  const due = await listActivationsDueForStart(db, now);
  let started = 0;
  let failed = 0;
  for (const companyId of due) {
    try {
      const outcome = await db.transaction((savepoint) =>
        settleListingActivation(savepoint, stripe, companyId, now),
      );
      if (outcome === "started") started += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[listing-activation] sweep could not start ${companyId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      await enqueueOutbox(db, LISTING_ACTIVATION_SETTLE_TOPIC, { companyId });
    }
  }
  return { started, failed };
}

/**
 * The real Stripe wiring. Imports are dynamic for the reason
 * `productionListingHoldDeps` gives: `@/env` reads secrets at module scope.
 */
export async function productionListingActivationDeps(): Promise<ListingActivationDeps> {
  const [{ default: StripeClient }, { env }, { checkoutPriceIdForPlan }] =
    await Promise.all([import("stripe"), import("@/env"), import("./prices")]);
  const stripe = new StripeClient(env.server.STRIPE_SECRET_KEY);

  return {
    createCheckoutSession: (params, idempotencyKey) =>
      stripe.checkout.sessions.create(params, { idempotencyKey }),
    retrieveCheckoutSession: (id) =>
      stripe.checkout.sessions.retrieve(id, { expand: ["setup_intent"] }),
    createSubscription: (params, idempotencyKey) =>
      stripe.subscriptions.create(params, { idempotencyKey }),
    listingPriceId: (db) => checkoutPriceIdForPlan(db, "listing"),
    listCustomerSubscriptions: async (customerId) =>
      (
        await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
        })
      ).data.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        trial_end: subscription.trial_end,
        metadata: subscription.metadata,
      })),
    retrieveSetupIntent: (id) => stripe.setupIntents.retrieve(id),
  };
}
