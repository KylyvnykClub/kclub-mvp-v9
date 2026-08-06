import { pgTable, varchar, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./columns";
import { members } from "./members";
import { companies } from "./companies";

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

  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // active, past_due, canceled, unpaid, etc.
  priceId: varchar("price_id", { length: 255 }).notNull(),

  currentPeriodStart: timestamp("current_period_start", {
    mode: "date",
  }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }).notNull(),
  cancelAtPeriodEnd: timestamp("cancel_at_period_end", { mode: "date" }),
  canceledAt: timestamp("canceled_at", { mode: "date" }),
});
