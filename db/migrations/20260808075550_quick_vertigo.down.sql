ALTER TABLE "sessions" DROP COLUMN IF EXISTS "is_partial_session";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "totp_enabled";
--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "totp_secret";
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "role" TYPE text USING "role"::text;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."member_role";
--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('user', 'admin');
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "role" TYPE "public"."member_role" USING "role"::"public"."member_role";
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "role" SET DEFAULT 'user';
