import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/data/db";
import { findLapsedSubscriptions } from "@/data/billing";
import { env } from "@/env";
import { runGraceExpiryWarningSweep } from "@/modules/billing/grace-warning";
import {
  reconcileSubscription,
  subscriptionFetcherFor,
} from "@/modules/billing/projection";
import { authorizeCronRequest } from "@/modules/platform";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);
const fetchSubscription = subscriptionFetcherFor(stripe);

export interface LapseResult {
  checked: number;
  revoked: number;
  renewed: number;
  deleted: number;
  failed: number;
  graceWarningsChecked: number;
  graceWarningsQueued: number;
  graceWarningsFailed: number;
}

/**
 * The billing time sweep. It carries two jobs, both keyed off the same `now`.
 *
 * FR-054: a cancelled subscription must lose access within 5 minutes of its
 * paid period ending. Re-fetches any subscription whose local status is still
 * `active` but whose `currentPeriodEnd` has passed; the projection worker makes
 * the actual state change — if Stripe says the subscription is now `canceled`,
 * the tier is demoted; if Stripe renewed it, the period is updated and access
 * continues. In practice the webhook usually gets there first (ADR 0017); this
 * is the backstop for when it does not.
 *
 * FR-056: warn a subscriber before the dunning grace period ends. That sweep
 * runs *after* the lapse loop, because the loop can move a subscription out of
 * `past_due` and the warning should see the freshest status.
 *
 * `vercel.json` schedules this daily at 00:35 — the Hobby plan rejects anything
 * finer. A previous version of this comment claimed every two minutes, which
 * stopped being true at PR #48.
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
    graceWarningsChecked: 0,
    graceWarningsQueued: 0,
    graceWarningsFailed: 0,
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

  // FR-056, after the lapse loop so it sees the freshest status.
  const grace = await runGraceExpiryWarningSweep(db, now);
  result.graceWarningsChecked = grace.checked;
  result.graceWarningsQueued = grace.queued;
  result.graceWarningsFailed = grace.failed;

  return NextResponse.json({ success: true, ...result });
}
