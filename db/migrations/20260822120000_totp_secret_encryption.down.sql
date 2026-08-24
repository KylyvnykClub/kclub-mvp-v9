-- The discarded plaintext seeds are not restored, because they cannot be and
-- because they should not be: they were exposed at rest and re-enrolment is the
-- only honest recovery. Rolling back therefore returns the schema, not the data
-- - staff who enrolled after the up-migration keep an encrypted value in
-- "totp_secret" that the pre-migration code would hand to verifyTotpCode() as
-- though it were base32, and be unable to verify.
--
-- In other words: rolling this back requires re-enrolment too.
ALTER TABLE "sessions"
  DROP COLUMN IF EXISTS "pending_totp_secret";
