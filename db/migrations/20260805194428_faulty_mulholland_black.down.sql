ALTER TABLE "companies" DROP COLUMN IF EXISTS "rejection_reason";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "moderation_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."moderation_status";
