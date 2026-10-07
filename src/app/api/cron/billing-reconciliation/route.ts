import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { env } from "@/env";
import {
  productionListingActivationDeps,
  startDueListingActivations,
} from "@/modules/billing/listing-activation";
import { subscriptionFetcherFor } from "@/modules/billing/projection";
import { reconcileLocalSubscriptions } from "@/modules/billing/reconciliation";
import { authorizeCronRequest } from "@/modules/platform";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);
const fetchSubscription = subscriptionFetcherFor(stripe);

/**
 * FR-058: daily reconciliation compares local subscription projection against
 * Stripe's API view and alerts on any divergence. It never repairs rows here;
 * projection remains owned by webhook/outbox/lapse workers. It also starts
 * saved-card listings that have become due (ADR 0044).
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  const result = await reconcileLocalSubscriptions(db, fetchSubscription);
  // ADR 0044 §5: listings whose EU 14 days have passed start here, once a
  // day - the same sweep that already reads Stripe daily.
  const activations = await startDueListingActivations(
    db,
    await productionListingActivationDeps(),
    new Date(),
  );

  return NextResponse.json({ success: true, ...result, activations });
}
