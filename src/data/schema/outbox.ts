import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
