-- FR-009: the 30-day erasure anonymises the member row rather than deleting
-- it, so payment and audit records keep a valid foreign key
-- (data-storage.md §4). This column is the marker that the erasure has run.
ALTER TABLE "members"
  ADD COLUMN "deleted_at" timestamp with time zone;

-- The erasure sweep looks for members awaiting it, not for members in general.
CREATE INDEX "members_pending_deletion_idx"
  ON "members" ("status")
  WHERE "deleted_at" IS NULL;
