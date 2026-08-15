CREATE TABLE "company_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "owner_id" uuid NOT NULL UNIQUE REFERENCES "members"("id") ON DELETE CASCADE,
  "step" integer DEFAULT 1 NOT NULL,
  "data" jsonb NOT NULL
);

-- The retention sweep (data-storage.md §4, 90 days) scans by last edit.
CREATE INDEX "company_drafts_updated_at_idx" ON "company_drafts" ("updated_at");
