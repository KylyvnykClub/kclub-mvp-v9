import { pgEnum, pgTable, varchar, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";
import { companies } from "./companies";

/**
 * Which product a subscription is for (ADR 0033).
 *
 * Until membership dues existed this was inferred - "a member subscription with
 * no company attached is VIP" - and that inference is exactly what dues break:
 * they are also member-scoped and also carry no company, so every member paying
 * $4.99 would have read as VIP and been handed the referral entitlement
 * (FR-070). The plan is therefore stored, resolved from the price when the
 * subscription is projected.
 */
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "membership",
  "vip",
  "listing",
]);

export const subscriptions = pgTable("subscriptions", {
  ...baseColumns,
  // Using Stripe's ID directly as our primary ID is possible, but for consistency we use our UUID
  // and store Stripe's ID in a unique column.
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 })
    .notNull()
    .unique(),

  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),

  companyId: uuid("company_id").references(() => companies.id, {
    onDelete: "cascade",
  }), // only set if it's a listing subscription

  /** Which product this pays for (ADR 0033). Never inferred at read time. */
  plan: subscriptionPlanEnum("plan").notNull(),

  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // active, past_due, canceled, unpaid, etc.
  priceId: varchar("price_id", { length: 255 }).notNull(),

  currentPeriodStart: timestamp("current_period_start", {
    mode: "date",
  }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }).notNull(),
  cancelAtPeriodEnd: timestamp("cancel_at_period_end", { mode: "date" }),
  canceledAt: timestamp("canceled_at", { mode: "date" }),

  // ADR 0004: watermark of the last applied Stripe event's `created`
  // timestamp. A delivery of an event older than this is a late delivery and
  // is discarded rather than regressing state (integration.md §4 —
  // out-of-order delivery is normal). The Subscription object has no `updated`
  // field in the pinned API version, so the event clock is the ordering key.
  stripeUpdatedAt: timestamp("stripe_updated_at", { mode: "date" }),
});
