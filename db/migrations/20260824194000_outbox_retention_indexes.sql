-- The outbox carried a primary key and nothing else. Two paths scan it on a
-- schedule and both degrade into full scans as processed history piles up:
--   - drainOutbox / countPending (src/data/outbox.ts) read only unprocessed
--     rows, oldest first;
--   - findSubscriptionsNearingGraceExpiry (src/data/billing.ts) deduplicates
--     the FR-056 grace warning with a NOT EXISTS over the outbox that filters on
--     topic and two payload discriminators.
-- These two indexes match those predicates. The retention sweep that keeps the
-- table from growing forever lives in the retention cron, not here. See the
-- backlog item outbox-has-no-retention-and-no-payload-index.
--
-- NOTE: no statement separator character may appear inside these comments. The
-- migration runner in tests/setup/global-setup.ts splits on it without parsing
-- comments, so one here would cut the comment in half and prepend the leftover
-- text to the next statement.
CREATE INDEX IF NOT EXISTS "outbox_pending_created_idx"
  ON "outbox" ("created_at")
  WHERE "processed_at" IS NULL;

CREATE INDEX IF NOT EXISTS "outbox_billing_dedupe_idx"
  ON "outbox" ("topic", ("payload" ->> 'type'), ("payload" ->> 'subscriptionId'), "created_at");
