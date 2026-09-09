DROP INDEX IF EXISTS "join_links_one_active";
--> statement-breakpoint
DROP TABLE IF EXISTS "join_links";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "plan";
--> statement-breakpoint
DROP TYPE IF EXISTS "subscription_plan";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "dues_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "member_dues_kind";
