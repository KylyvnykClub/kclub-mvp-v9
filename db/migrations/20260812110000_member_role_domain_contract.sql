ALTER TABLE "members" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."member_role" RENAME TO "member_role_legacy";--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM(
  'user',
  'admin',
  'member',
  'member_vip',
  'partner_owner',
  'staff_support',
  'staff_moderator',
  'staff_admin',
  'staff_owner'
);--> statement-breakpoint
ALTER TABLE "members"
  ALTER COLUMN "role" TYPE "public"."member_role"
  USING (
    CASE "role"::text
      WHEN 'user' THEN 'member'
      WHEN 'admin' THEN 'staff_owner'
      ELSE "role"::text
    END
  )::"public"."member_role";--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint
DROP TYPE "public"."member_role_legacy";
