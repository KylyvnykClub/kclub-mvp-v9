import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import {
  processWebhookOnce,
  setCardTierForMember,
  setSubscriptionStatus,
  upsertSubscription,
  type SubscriptionUpsert,
} from "@/data/billing";
import type { DbTx } from "@/data/db";
import { env } from "@/env";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

function subscriptionToUpsert(
  subscription: Stripe.Subscription,
): SubscriptionUpsert {
  const item = subscription.items.data[0];
  const metadata = subscription.metadata;
  const memberId = metadata.memberId;
  const companyId = metadata.companyId;

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
  };
}

async function handleSubscriptionCreatedOrUpdated(
  tx: DbTx,
  subscription: Stripe.Subscription,
): Promise<void> {
  const values = subscriptionToUpsert(subscription);
  await upsertSubscription(tx, values);

  // A subscription without a company is a VIP membership: project the
  // entitlement onto the member's card.
  if (!values.companyId) {
    const newTier = subscription.status === "active" ? "vip" : "free";
    await setCardTierForMember(tx, values.memberId, newTier);
  }
}

async function handleSubscriptionDeleted(
  tx: DbTx,
  subscription: Stripe.Subscription,
): Promise<void> {
  await setSubscriptionStatus(tx, subscription.id, subscription.status);

  const companyId = subscription.metadata.companyId;
  const memberId = subscription.metadata.memberId;

  if (memberId && !companyId) {
    await setCardTierForMember(tx, memberId, "free");
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature");

  if (!signature) {
    return new NextResponse("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.server.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    await processWebhookOnce(db, event.id, event.type, async (tx) => {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionCreatedOrUpdated(tx, event.data.object);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(tx, event.data.object);
          break;

        default:
          break;
      }
    });

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Webhook handler failed for event ${event.id}: ${message}`);
    return new NextResponse("Webhook handler failed", { status: 500 });
  }
}
