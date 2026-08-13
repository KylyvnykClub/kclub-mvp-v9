import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { members } from "./members";

export const planPrices = pgTable("plan_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  plan: text("plan").notNull(),
  stripePriceId: text("stripe_price_id").notNull(),
  active: boolean("active").notNull().default(true),
  effectiveFrom: timestamp("effective_from", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by").references(() => members.id, {
    onDelete: "set null",
  }),
});
