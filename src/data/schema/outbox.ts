import { sql } from "drizzle-orm";
import {
  index,
  integer,
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

    /**
     * Failed attempts only. A row that goes through is marked processed inside
     * the same transaction, so this never counts a success - it reads as how
     * many times the row has refused. Without it a permanently failing row
     * looks exactly like one the drain has not reached yet, which is how a
     * stuck billing projection went unnoticed until the member who paid for
     * it reported a free card.
     */
    attempts: integer("attempts").notNull().default(0),

    /** The message from the most recent failure, for the same reason. */
    lastError: text("last_error"),
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
