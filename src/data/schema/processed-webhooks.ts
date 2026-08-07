import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

export const processedWebhooks = pgTable("processed_webhooks", {
  id: varchar("id", { length: 255 }).primaryKey(), // Stripe event ID
  type: varchar("type", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
