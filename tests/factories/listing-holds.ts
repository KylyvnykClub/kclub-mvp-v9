import type { DbClient } from "@/data/db.js";
import { upsertListingHold } from "@/data/listing-holds.js";

/**
 * A listing hold as the webhook projection would record it: the price
 * authorised on the card and not yet captured (ADR 0037). What puts a pending
 * company into the moderation queue (FR-113).
 */
export async function seedCapturableHold(
  db: DbClient,
  params: {
    companyId: string;
    memberId: string;
    /** Defaults to a week from now; pass a past date for a lapsed hold. */
    captureBefore?: Date;
    status?: string;
  },
): Promise<string> {
  const paymentIntentId = `pi_test_${crypto.randomUUID().replaceAll("-", "")}`;
  await upsertListingHold(db, {
    stripePaymentIntentId: paymentIntentId,
    companyId: params.companyId,
    memberId: params.memberId,
    stripeCustomerId: "cus_test",
    status: params.status ?? "requires_capture",
    amountMinor: 1999,
    currency: "usd",
    captureBefore:
      params.captureBefore ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    capturedAt: null,
    coversUntil: null,
    refundedAt: null,
    stripeUpdatedAt: new Date(),
  });
  return paymentIntentId;
}
