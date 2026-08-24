import type Stripe from "stripe";
import type { Db } from "@/data/db";
import { processWebhookOnce } from "@/data/billing";
import { enqueueOutbox } from "@/data/outbox";
import { BILLING_OUTBOX_TOPIC, BILLING_NOTIFICATION_TOPIC } from "./projection";

/**
 * How the handler defers the projection. In production this is Next's
 * `after()`; a test passes an executor that collects the task and runs it by
 * hand, so the assertion is about this code path rather than about a mock.
 */
export type AfterScheduler = (task: () => Promise<void>) => void;

/**
 * Everything the handler touches outside itself, injected. Nothing in this
 * module reads `@/env` or opens the production connection at import time —
 * that wiring lives in the route, which keeps the handler importable by a test
 * that has no secrets.
 */
export interface StripeWebhookDeps {
  db: Db;
  /** Verifies the signature over the raw body. Throws if it does not match. */
  constructEvent: (body: string, signature: string) => Stripe.Event;
  /** The outbox drain, deferred by `schedule`. */
  drain: () => Promise<unknown>;
}

/**
 * The handler contract from integration.md §4: verify the signature, insert the
 * event id, write an outbox row, return 200 — and do nothing else *before
 * responding*. Projection happens in the worker
 * (src/modules/billing/projection.ts), which re-fetches the subscription from
 * the Stripe API rather than trusting this payload's fields (ADR 0004).
 *
 * Since ADR 0017 the worker is invoked through `schedule`, which in production
 * is Next's `after()` and runs once the 200 is already on the wire. Stripe's
 * delivery timer has stopped by then, so the reason the contract says "and do
 * nothing else" — a slow handler makes the sender retry against a half-finished
 * one — does not apply to it. This is what keeps FR-026's 60-second bound
 * reachable on a plan whose cron runs once a day.
 */
export async function handleStripeWebhook(
  req: Request,
  schedule: AfterScheduler,
  deps: StripeWebhookDeps,
): Promise<Response> {
  const body = await req.text();
  const signature = req.headers.get("Stripe-Signature");

  if (!signature) {
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = deps.constructEvent(body, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    await processWebhookOnce(deps.db, event.id, event.type, async (tx) => {
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

      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;
        const subDetails = invoice.parent?.subscription_details;
        const subscriptionId =
          typeof subDetails?.subscription === "string"
            ? subDetails.subscription
            : subDetails?.subscription?.id;

        if (subscriptionId) {
          await enqueueOutbox(tx, BILLING_NOTIFICATION_TOPIC, {
            eventId: event.id,
            type: "payment_failed",
            subscriptionId,
            customerId:
              typeof invoice.customer === "string"
                ? invoice.customer
                : invoice.customer?.id,
            attemptCount: invoice.attempt_count,
          });
        }
      }
    });

    // ADR 0017. Runs after the response below has been sent, so nothing here is
    // inside Stripe's delivery window. A failure leaves the outbox row exactly
    // as a failed cron drain would: unprocessed, for the next sweep to retry.
    schedule(async () => {
      try {
        await deps.drain();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[billing-projection] inline drain failed after event ${event.id}: ${message}`,
        );
      }
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Webhook handler failed for event ${event.id}: ${message}`);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
