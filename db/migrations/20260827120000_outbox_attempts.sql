-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- A failing outbox row was indistinguishable from one that had never been
-- tried: the table carried only processed_at, so nothing recorded that a row
-- had been attempted, how often, or why it failed. A stuck billing projection
-- therefore sat unnoticed while the member who paid for it kept a free card,
-- until that member said so. These two columns are what make it visible
-- without needing someone to complain.
--
-- attempts counts failed attempts only. A row that succeeds is marked
-- processed in the same transaction, so a successful drain never increments it
-- and the count reads as "how many times this row has refused to go through".
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text;
