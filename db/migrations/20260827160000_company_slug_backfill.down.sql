-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- Deliberately empty. This migration repaired data rather than changing the
-- schema, and its only inverse would be to hand a company back an empty slug -
-- which the unique index permits for exactly one row and which breaks that
-- company's public page. Rolling the schema back does not require reinstating
-- a broken address.
SELECT 1
