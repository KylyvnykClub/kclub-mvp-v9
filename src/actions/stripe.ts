"use server";

import Stripe from "stripe";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import {
  findStripeCustomerIdByMember,
  insertStripeCustomerMapping,
} from "@/data/billing";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

export async function getOrCreateStripeCustomer(
  memberId: string,
  email?: string,
  name?: string,
) {
  const existing = await findStripeCustomerIdByMember(db, memberId);

  if (existing) {
    return existing;
  }

  const customer = await stripe.customers.create({
    metadata: {
      memberId: memberId,
    },
    email: email || undefined,
    name: name || undefined,
  });

  await insertStripeCustomerMapping(db, memberId, customer.id);

  return customer.id;
}

async function appOrigin(): Promise<string> {
  const headersList = await headers();
  return headersList.get("origin") || env.server.NEXT_PUBLIC_APP_URL;
}

export async function createCheckoutSessionAction(
  priceId: string,
  companyId?: string,
) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(
    auth.member.id,
    undefined,
    auth.member.displayName,
  );

  const origin = await appOrigin();

  const metadata: Record<string, string> = {
    memberId: auth.member.id,
  };

  if (companyId) {
    metadata.companyId = companyId;
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata,
    subscription_data: {
      metadata,
    },
    success_url: `${origin}/en/dashboard/profile?checkout=success`,
    cancel_url: `${origin}/en/dashboard/profile?checkout=canceled`,
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  redirect(session.url);
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

  const origin = await appOrigin();

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/en/dashboard/profile`,
  });

  if (!portalSession.url) {
    throw new Error("Failed to create portal session");
  }

  redirect(portalSession.url);
}
