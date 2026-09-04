ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_email_unique";
--> statement-breakpoint
DROP TABLE IF EXISTS "verification_tokens";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."verification_purpose";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "email_verified_at";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "email";
