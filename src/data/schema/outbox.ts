import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    // drainOutbox / countPending only ever look at unprocessed rows ordered by
    // age. A partial index keeps that scan off the growing tail of processed
    // rows, so the drain stays cheap as the table accumulates history.
    index("outbox_pending_created_idx")
      .on(table.createdAt)
      .where(sql`${table.processedAt} is null`),

    // findSubscriptionsNearingGraceExpiry (data/billing.ts) deduplicates the
    // FR-056 grace warning with a NOT EXISTS over the outbox that filters on
    // topic and two payload discriminators. Without an index that subquery is a
    // full scan on every sweep; this expression index matches its predicate.
    index("outbox_billing_dedupe_idx").on(
      table.topic,
      sql`(${table.payload} ->> 'type')`,
      sql`(${table.payload} ->> 'subscriptionId')`,
      table.createdAt,
    ),
  ],
);
