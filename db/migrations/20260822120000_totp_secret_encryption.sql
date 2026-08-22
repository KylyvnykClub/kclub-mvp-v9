-- Staff TOTP seeds were stored as plaintext base32 in "members"."totp_secret",
-- contradicting security.md §"Secret" ("the database never holds a usable
-- credential"). They are now encrypted with AES-256-GCM bound to the member id
-- (src/modules/identity/totp-crypto.ts).
--
-- Every existing value is a usable credential that has already been at rest in
-- the clear, in every backup taken so far. Encrypting them in place would
-- preserve a secret that must be considered exposed, so they are discarded and
-- the affected staff enrol a fresh authenticator on next sign-in. The values
-- have no down-migration, for the reason recorded in the .down.sql file.
--
-- NOTE: no statement separator character may appear inside these comments. The
-- migration runner in tests/setup/global-setup.ts splits on it without parsing
-- comments, so one here would cut the comment in half and prepend the leftover
-- text to the next statement, which then fails to parse.
UPDATE "members"
SET "totp_secret" = NULL,
    "totp_enabled" = false
WHERE "totp_secret" IS NOT NULL;

-- The seed generated during enrolment used to travel to the browser and be
-- accepted back from it on the verify request, which meant the server took the
-- client's word for which secret to store. It now waits here, encrypted,
-- against the partial session that generated it, and the client only ever
-- receives the QR/URI it has to display.
ALTER TABLE "sessions"
  ADD COLUMN "pending_totp_secret" text;
