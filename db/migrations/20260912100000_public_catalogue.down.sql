-- Back to a members-only catalogue: the flag exists and is off, which is what
-- the application read before ADR 0034 for a database that never had the row.
UPDATE feature_flag SET enabled = false, updated_at = now()
WHERE name = 'public_catalogue';
