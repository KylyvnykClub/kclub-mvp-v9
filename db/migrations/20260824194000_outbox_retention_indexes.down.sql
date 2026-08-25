-- Drop the two outbox indexes. They hold no data, so the rollback is exact: the
-- table returns to its primary key alone.
DROP INDEX IF EXISTS "outbox_billing_dedupe_idx";

DROP INDEX IF EXISTS "outbox_pending_created_idx";
