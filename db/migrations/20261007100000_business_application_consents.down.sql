-- Back to applications without recorded consents. The records are evidence of
-- contracts; take a copy before running this anywhere that matters.
ALTER TABLE "companies"
  DROP CONSTRAINT IF EXISTS "companies_application_route_known",
  DROP COLUMN IF EXISTS "withdrawn_at",
  DROP COLUMN IF EXISTS "application_invite_link_id",
  DROP COLUMN IF EXISTS "application_route";
--> statement-breakpoint

DROP TABLE IF EXISTS "listing_activations";
--> statement-breakpoint

DROP TABLE IF EXISTS "consent_records";
--> statement-breakpoint

DROP TYPE IF EXISTS "consent_kind";
--> statement-breakpoint

DROP TYPE IF EXISTS "application_route";
