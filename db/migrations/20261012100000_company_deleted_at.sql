-- FR-046: staff delete a company. A soft delete - the row and its moderation
-- history stay; the company is rejected at the same moment and is never
-- approved again (data-storage.md §4).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
