import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { findLapsedSubscriptions } from "@/data/billing";
import { env } from "@/env";
import { reconcileSubscription } from "@/modules/billing/projection";
import { authorizeCronRequest } from "@/modules/platform";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);
const fetchSubscription = stripe.subscriptions.retrieve.bind(stripe);

export interface LapseResult {
  checked: number;
  revoked: number;
  renewed: number;
  deleted: number;
  failed: number;
}

/**
 * FR-054: a cancelled subscription must lose access within 5 minutes of its
 * paid period ending. This cron runs every 2 minutes and re-fetches any
 * subscription whose local status is still `active` but whose
 * `currentPeriodEnd` has passed. The projection worker handles the actual
 * state change — if Stripe says the subscription is now `canceled`, the
 * tier is demoted; if Stripe renewed it, the period is updated and access
 * continues.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req, env.server.CRON_SECRET);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const lapsed = await findLapsedSubscriptions(db, now);

  const result: LapseResult = {
    checked: lapsed.length,
    revoked: 0,
    renewed: 0,
    deleted: 0,
    failed: 0,
  };

  for (const row of lapsed) {
    try {
      const nowEpoch = Math.floor(now.getTime() / 1000);
      const outcome = await reconcileSubscription(
        db,
        fetchSubscription,
        row.stripeSubscriptionId,
        nowEpoch,
      );

      if (outcome === "applied") {
        result.revoked += 1;
      } else if (outcome === "stale") {
        result.renewed += 1;
      } else if (outcome === "deleted") {
        result.deleted += 1;
      }
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[subscription-lapse] failed for ${row.stripeSubscriptionId}: ${message}`,
      );
    }
  }

  return NextResponse.json({ success: true, ...result });
}
