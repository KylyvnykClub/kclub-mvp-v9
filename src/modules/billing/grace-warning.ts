import type { DbClient } from "@/data/db";
import {
  GRACE_PERIOD_DAYS,
  findSubscriptionsNearingGraceExpiry,
  graceAnchorOf,
} from "@/data/billing";
import {
  BILLING_NOTIFICATION_TOPIC,
  GRACE_EXPIRY_WARNING_NOTIFICATION,
  enqueueOutbox,
} from "@/data/outbox";

export interface GraceWarningResult {
  checked: number;
  queued: number;
  failed: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * FR-056, the half that was never built: "notify the subscriber on failure
 * **and before expiry**". The failure notice comes from the
 * `invoice.payment_failed` webhook; this is the second one.
 *
 * A producer, not a sender. It enqueues one notification row per subscriber
 * whose dunning grace period is about to end, and the existing outbox consumer
 * sends the email. Being enqueued is itself what stops the next sweep repeating
 * it, so a row that has not been drained yet still suppresses a duplicate.
 *
 * No `companyId` filter: the failure half notifies for VIP and listing
 * subscriptions alike, and filtering here would make the two halves disagree
 * about who gets told.
 */
export async function runGraceExpiryWarningSweep(
  db: DbClient,
  now: Date,
): Promise<GraceWarningResult> {
  const candidates = await findSubscriptionsNearingGraceExpiry(db, now);

  const result: GraceWarningResult = {
    checked: candidates.length,
    queued: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      const graceEndsAt = new Date(
        graceAnchorOf(candidate, now).getTime() +
          GRACE_PERIOD_DAYS * MS_PER_DAY,
      );

      await enqueueOutbox(db, BILLING_NOTIFICATION_TOPIC, {
        type: GRACE_EXPIRY_WARNING_NOTIFICATION,
        subscriptionId: candidate.stripeSubscriptionId,
        customerId: candidate.stripeCustomerId,
        memberId: candidate.memberId,
        // Not read by the email — its copy carries no date. It is here so the
        // row explains itself to whoever reads the outbox during an incident.
        graceEndsAt: graceEndsAt.toISOString(),
      });

      result.queued += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[grace-warning] failed for subscription ${candidate.stripeSubscriptionId}: ${message}`,
      );
    }
  }

  return result;
}
