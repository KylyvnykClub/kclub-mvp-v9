-- FR-042: an unmoderated company must not be visible to any member. The column
-- defaulted to 'approved', so any insert path that omitted it would publish a
-- submission that nobody had looked at. Existing rows are left untouched: this
-- changes what happens next, not what was already decided.
ALTER TABLE "companies"
  ALTER COLUMN "moderation_status" SET DEFAULT 'pending';
