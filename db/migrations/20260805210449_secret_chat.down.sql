DROP TABLE IF EXISTS "referrals";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "city";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "country";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "can_send_referrals";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "locale";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."referral_status";
