import {
  bigint,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";
import { companies } from "./companies";

/**
 * A partner's first listing payment, held on the card while the application is
 * reviewed (ADR 0037, FR-113…FR-116).
 *
 * One row per Stripe PaymentIntent created with `capture_method = manual`. It
 * is a projection, exactly like `subscriptions`: every column but the ids is
 * re-read from the Stripe API when a `payment_intent.*` event arrives, and the
 * event's `created` timestamp is the watermark that discards a late delivery.
 * Nothing here is written from a checkout redirect or from what the browser
 * says (ADR 0004).
 *
 * A captured hold pays for the first month of the listing, so while
 * `covers_until` is in the future it publishes the company just as an
 * access-granting subscription would. The subscription that bills every month
 * after that is started from the saved card once the capture is confirmed, and
 * its id is recorded here so it is started once.
 */
export const listingHolds = pgTable(
  "listing_holds",
  {
    ...baseColumns,

    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    })
      .notNull()
      .unique(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),

    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),

    /** The PaymentIntent's own status, verbatim (`requires_capture`, `succeeded`, `canceled`, …). */
    status: varchar("status", { length: 50 }).notNull(),

    /** Integer minor units, as Stripe reports it. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),

    /** When the card network releases an uncaptured authorisation. */
    captureBefore: timestamp("capture_before", { withTimezone: true }),

    /** When the moderator's approval asked Stripe to capture. Not a payment. */
    captureRequestedAt: timestamp("capture_requested_at", {
      withTimezone: true,
    }),

    /** When Stripe confirmed the capture, from the charge itself. */
    capturedAt: timestamp("captured_at", { withTimezone: true }),

    /** The end of the month the captured amount paid for. */
    coversUntil: timestamp("covers_until", { withTimezone: true }),

    /** Set once a captured hold has been refunded in full. */
    refundedAt: timestamp("refunded_at", { withTimezone: true }),

    /** The monthly subscription started from this hold's saved card. */
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),

    /** ADR 0004 watermark: the `created` of the last applied Stripe event. */
    stripeUpdatedAt: timestamp("stripe_updated_at", { withTimezone: true }),
  },
  (table) => [index("listing_holds_company_id_idx").on(table.companyId)],
);
