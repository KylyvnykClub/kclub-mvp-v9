ALTER TABLE "members" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."member_role" RENAME TO "member_role_domain";--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM(
  'user',
  'admin',
  'staff_support',
  'staff_moderator',
  'staff_admin',
  'staff_owner'
);--> statement-breakpoint
ALTER TABLE "members"
  ALTER COLUMN "role" TYPE "public"."member_role"
  USING (
    CASE "role"::text
      WHEN 'member' THEN 'user'
      WHEN 'member_vip' THEN 'user'
      WHEN 'partner_owner' THEN 'user'
      ELSE "role"::text
    END
  )::"public"."member_role";--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint
DROP TYPE "public"."member_role_domain";
