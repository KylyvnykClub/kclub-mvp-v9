DROP INDEX IF EXISTS "members_pending_deletion_idx";

ALTER TABLE "members"
  DROP COLUMN IF EXISTS "deleted_at";
