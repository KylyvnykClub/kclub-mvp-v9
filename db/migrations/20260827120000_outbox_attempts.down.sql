-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- Drop the failure bookkeeping. Nothing depends on it for correctness: the
-- drain decides what to do from processed_at alone, and these columns only
-- describe why a row is still pending.
ALTER TABLE outbox DROP COLUMN IF EXISTS last_error;

ALTER TABLE outbox DROP COLUMN IF EXISTS attempts;
