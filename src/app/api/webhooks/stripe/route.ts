import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { processWebhookOnce } from "@/data/billing";
import { enqueueOutbox } from "@/data/outbox";
import { env } from "@/env";
import { BILLING_OUTBOX_TOPIC } from "@/modules/billing/projection";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

/**
 * The handler contract from integration.md §4, verbatim: verify the signature,
 * insert the event id, write an outbox row, return 200 — and do nothing else.
 * Projection happens in the worker (src/modules/billing/projection.ts), which
 * re-fetches the subscription from the Stripe API rather than trusting this
 * payload's fields (ADR 0004).
 */
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
      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        await enqueueOutbox(tx, BILLING_OUTBOX_TOPIC, {
          eventId: event.id,
          eventCreated: event.created,
          subscriptionId: event.data.object.id,
        });
      }
    });

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Webhook handler failed for event ${event.id}: ${message}`);
    return new NextResponse("Webhook handler failed", { status: 500 });
  }
}
