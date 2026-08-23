import { after } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { env } from "@/env";
import { handleStripeWebhook } from "@/modules/billing/stripe-webhook";
import {
  INLINE_BATCH_SIZE,
  runOutboxDrain,
} from "@/modules/platform/outbox-worker";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

/**
 * Stripe's only inbound endpoint. The handler itself lives in the billing
 * module (`stripe-webhook.ts`); this file is the production wiring, and it is
 * where the secrets and the connection are read. Keeping them here is what lets
 * a test import the handler and assert what ADR 0017 decided — that the
 * projection runs in this invocation, after the response — without needing
 * either.
 */
export async function POST(req: Request) {
  return handleStripeWebhook(req, after, {
    db,
    constructEvent: (body, signature) =>
      stripe.webhooks.constructEvent(
        body,
        signature,
        env.server.STRIPE_WEBHOOK_SECRET,
      ),
    drain: () => runOutboxDrain(INLINE_BATCH_SIZE),
  });
}
