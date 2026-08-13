CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "subscription_choices" jsonb NOT NULL,
  CONSTRAINT "account_deletion_requests_member_id_members_id_fk"
    FOREIGN KEY ("member_id") REFERENCES "public"."members"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_member"
  ON "account_deletion_requests" ("member_id", "requested_at" DESC);
