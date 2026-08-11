DROP TABLE IF EXISTS "companies";
--> statement-breakpoint
DROP TABLE IF EXISTS "business_categories";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "role";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."member_role";
