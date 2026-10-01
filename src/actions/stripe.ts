"use server";

import Stripe from "stripe";
import { z } from "zod";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import { findStripeCustomerIdByMember } from "@/data/billing";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import {
  appOrigin,
  getOrCreateStripeCustomer,
  listingHoldCheckoutUrl,
} from "@/modules/billing/listing-hold-checkout";
import { redirect } from "next/navigation";
import { env } from "@/env";
import {
  checkoutIdempotencyKey,
  type CheckoutPlan,
} from "@/modules/billing/checkout";
import { checkoutPriceIdForPlan } from "@/modules/billing/prices";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

async function createSubscriptionCheckout(params: {
  plan: CheckoutPlan;
  priceId: string;
  companyId?: string;
}) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const locale = auth.member.language || "en";

  const stripeCustomerId = await getOrCreateStripeCustomer(
    auth.member.id,
    undefined,
    auth.member.displayName,
  );

  const origin = await appOrigin();

  const metadata: Record<string, string> = {
    memberId: auth.member.id,
  };

  if (params.companyId) {
    metadata.companyId = params.companyId;
  }

  const companyQuery = params.companyId
    ? `?company=${encodeURIComponent(params.companyId)}`
    : "";

  const session = await stripe.checkout.sessions.create(
    {
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
      // The company id lets the result pages name what was paid for and say
      // what happens next. It selects copy and nothing else - entitlement is
      // projected from the webhook alone (ADR 0004).
      success_url: `${origin}/${locale}/dashboard/checkout/success${companyQuery}`,
      cancel_url: `${origin}/${locale}/dashboard/checkout/canceled${companyQuery}`,
    },
    {
      idempotencyKey: checkoutIdempotencyKey({
        memberId: auth.member.id,
        plan: params.plan,
        priceId: params.priceId,
        companyId: params.companyId,
      }),
    },
  );

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  redirect(session.url);
}

/**
 * Open membership dues checkout (FR-102).
 *
 * The session grants nothing on its return, exactly like the two beside it: the
 * member reaches the club when the subscription is projected from Stripe's own
 * event (FR-104, ADR 0004). Until then they are back on the dues screen, which
 * is the correct place for someone who has not paid.
 */
export async function createMembershipCheckoutAction() {
  await createSubscriptionCheckout({
    plan: "membership",
    priceId: await checkoutPriceIdForPlan(db, "membership"),
  });
}

export async function createVipCheckoutAction() {
  await createSubscriptionCheckout({
    plan: "vip",
    priceId: await checkoutPriceIdForPlan(db, "vip"),
  });
}

/**
 * Reserve the listing price on the card of whoever owns the company
 * (ADR 0037, FR-113) - a partner from their standing screen, or a member from
 * Profile → Companies. The one way a listing is paid for.
 *
 * Opens Stripe Checkout in `payment` mode with a manually captured
 * PaymentIntent, so the price is authorised and not charged. It is captured
 * when a moderator approves the application - or at once, if the application
 * is already approved - and released when one rejects it. The card is saved for
 * the monthly subscription that follows the first capture, and the receipt goes
 * to the owner's own address.
 *
 * The company id comes from the browser, so it is parsed and ownership is
 * checked inside `openListingHoldCheckout`. Like every checkout here, the
 * return grants nothing: the hold is recorded when Stripe's own
 * `payment_intent.*` event is projected (ADR 0004). An owner with nothing to
 * reserve - already held, already paid, rejected - is sent back to the screen
 * that says so.
 */
export async function createListingHoldCheckoutAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "update", "own_company");

  const parsed = z.string().uuid().safeParse(companyId);
  if (!parsed.success) {
    throw new Error("Invalid company id");
  }

  redirect(await listingHoldCheckoutUrl(auth.member, parsed.data));
}

export async function createPortalSessionAction() {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const stripeCustomerId = await findStripeCustomerIdByMember(
    db,
    auth.member.id,
  );

  if (!stripeCustomerId) {
    throw new Error("No billing account found");
  }

  const locale = auth.member.language || "en";
  const origin = await appOrigin();

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/${locale}/dashboard/profile`,
  });

  if (!portalSession.url) {
    throw new Error("Failed to create portal session");
  }

  redirect(portalSession.url);
}
