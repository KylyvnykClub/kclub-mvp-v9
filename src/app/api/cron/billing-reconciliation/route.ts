import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { env } from "@/env";
import { subscriptionFetcherFor } from "@/modules/billing/projection";
import { reconcileLocalSubscriptions } from "@/modules/billing/reconciliation";
import { authorizeCronRequest } from "@/modules/platform";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);
const fetchSubscription = subscriptionFetcherFor(stripe);

/**
 * FR-058: daily reconciliation compares local subscription projection against
 * Stripe's API view and alerts on any divergence. It never repairs rows here;
 * projection remains owned by webhook/outbox/lapse workers.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  const result = await reconcileLocalSubscriptions(db, fetchSubscription);

  return NextResponse.json({ success: true, ...result });
}
