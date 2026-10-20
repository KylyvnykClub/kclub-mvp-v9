-- ADR 0047: members review partners, anonymously, after moderation.
CREATE TYPE "review_status" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS "company_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "rating" smallint NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "body" varchar(1000) NOT NULL,
  "locale" varchar(2) NOT NULL,
  "status" "review_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "moderated_at" timestamp with time zone,
  "moderated_by" uuid REFERENCES "members"("id") ON DELETE SET NULL
);

-- One review per member per company (FR-127): a second submission edits it.
CREATE UNIQUE INDEX IF NOT EXISTS "company_reviews_company_member_idx"
  ON "company_reviews" ("company_id", "member_id");

-- The public block reads approved reviews of one company, newest first.
CREATE INDEX IF NOT EXISTS "company_reviews_company_status_idx"
  ON "company_reviews" ("company_id", "status", "created_at");
