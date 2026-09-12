-- ADR 0034: the partner catalogue is public.
--
-- The `public_catalogue` flag was added to the application after the migration
-- that seeded the first five flags, so a database migrated before it has no row
-- at all — and a missing row reads as off. That is why "Our partners" on the
-- marketing site sent a signed-out visitor to the sign-in page.
--
-- This sets the flag rather than only inserting it: the catalogue being open is
-- the decision, not the default. The staff console can still close it again.
INSERT INTO feature_flag (name, enabled, updated_at)
VALUES ('public_catalogue', true, now())
ON CONFLICT (name) DO UPDATE
  SET enabled = true, updated_at = now();
