import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { drainOutbox, markProcessed } from "@/data/outbox";
import { env } from "@/env";
import {
  BILLING_OUTBOX_TOPIC,
  reconcileSubscription,
} from "@/modules/billing/projection";
import { authorizeCronRequest } from "@/modules/platform";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);
const fetchSubscription = stripe.subscriptions.retrieve.bind(stripe);

const BATCH_SIZE = 25;

interface SubscriptionSyncPayload {
  eventId?: string;
  eventCreated?: number;
  subscriptionId?: string;
}

/** Result of the drain, for observability. */
export interface DrainResult {
  drained: number;
  processed: number;
  stale: number;
  deleted: number;
  failed: number;
}

/**
 * The projection worker for ADR 0004. Drains outbox rows written by the
 * webhook endpoint (which itself does nothing but verify, insert and write the
 * outbox row) and re-fetches the subscription from the Stripe API before
 * folding the entitlement. A row that fails is left unprocessed for the next
 * drain; SKIP LOCKED prevents two drains from taking the same row.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  const entries = await drainOutbox(db, BATCH_SIZE);
  const result: DrainResult = {
    drained: entries.length,
    processed: 0,
    stale: 0,
    deleted: 0,
    failed: 0,
  };

  for (const entry of entries) {
    if (entry.topic !== BILLING_OUTBOX_TOPIC) {
      // A topic no worker owns yet. Mark it so it does not sit unfinished
      // forever; a real worker registers its topic when it exists.
      await markProcessed(db, entry.id);
      continue;
    }

    const payload = entry.payload as SubscriptionSyncPayload;
    const subscriptionId = payload.subscriptionId;
    const eventCreated = payload.eventCreated;

    if (!subscriptionId || !eventCreated) {
      result.failed += 1;
      continue;
    }

    try {
      const outcome = await reconcileSubscription(
        db,
        fetchSubscription,
        subscriptionId,
        eventCreated,
      );
      if (outcome === "stale") result.stale += 1;
      else if (outcome === "deleted") result.deleted += 1;
      else result.processed += 1;
      await markProcessed(db, entry.id);
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      // Left unprocessed; the next drain retries it.
      console.error(
        `[billing-projection] failed for subscription ${subscriptionId}: ${message}`,
      );
    }
  }

  return NextResponse.json({ success: true, ...result });
}
