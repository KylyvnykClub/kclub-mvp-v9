"use server";

import Stripe from "stripe";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import {
  findStripeCustomerIdByMember,
  upsertStripeCustomerMapping,
} from "@/data/billing";
import { findCompanyByOwner } from "@/data/companies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";
import {
  checkoutIdempotencyKey,
  type CheckoutPlan,
} from "@/modules/billing/checkout";
import { checkoutPriceIdForPlan } from "@/modules/billing/prices";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

function stripeResourceMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === "resource_missing"
  );
}

async function stripeCustomerIsUsable(stripeCustomerId: string) {
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    return !customer.deleted;
  } catch (error) {
    if (stripeResourceMissing(error)) {
      return false;
    }

    throw error;
  }
}

export async function getOrCreateStripeCustomer(
  memberId: string,
  email?: string,
  name?: string,
) {
  const existing = await findStripeCustomerIdByMember(db, memberId);

  if (existing && (await stripeCustomerIsUsable(existing))) {
    return existing;
  }

  const customer = await stripe.customers.create({
    metadata: {
      memberId: memberId,
    },
    email: email || undefined,
    name: name || undefined,
  });

  await upsertStripeCustomerMapping(db, memberId, customer.id);

  return customer.id;
}

async function appOrigin(): Promise<string> {
  const headersList = await headers();
  return headersList.get("origin") || env.server.NEXT_PUBLIC_APP_URL;
}

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

export async function createVipCheckoutAction() {
  await createSubscriptionCheckout({
    plan: "vip",
    priceId: await checkoutPriceIdForPlan(db, "vip"),
  });
}

/**
 * Open listing checkout for a company the caller owns (FR-051).
 *
 * Since ADR 0019 this runs immediately after submission, before moderation, so
 * a `pending` company is eligible. Only a company that has already been
 * rejected is refused - paying for a listing that will not be published buys
 * nothing. Publication still requires approved AND an active subscription
 * (FR-044); the two gates are ANDed at read time and neither is relaxed here.
 */
export async function createCheckoutSessionAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const company = await findCompanyByOwner(db, companyId, auth.member.id);
  if (!company || company.moderationStatus === "rejected") {
    throw new Error("Company is not eligible for listing checkout");
  }

  await createSubscriptionCheckout({
    plan: "listing",
    priceId: await checkoutPriceIdForPlan(db, "listing"),
    companyId,
  });
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
