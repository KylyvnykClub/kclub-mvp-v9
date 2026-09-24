ALTER TABLE "company_drafts" ADD COLUMN IF NOT EXISTS "step" integer NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Back to three kinds. An enum value cannot be dropped, so the type is rebuilt
-- without it; any partner account becomes `paying`, which is the safe direction
-- - it owes dues rather than being let in free.
UPDATE "members" SET "dues_kind" = 'paying' WHERE "dues_kind" = 'partner';
--> statement-breakpoint

ALTER TYPE "member_dues_kind" RENAME TO "member_dues_kind_old";
--> statement-breakpoint

CREATE TYPE "member_dues_kind" AS ENUM ('paying', 'sponsored', 'legacy_free');
--> statement-breakpoint

ALTER TABLE "members" ALTER COLUMN "dues_kind" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "members"
  ALTER COLUMN "dues_kind" TYPE "member_dues_kind"
  USING "dues_kind"::text::"member_dues_kind";
--> statement-breakpoint

ALTER TABLE "members" ALTER COLUMN "dues_kind" SET DEFAULT 'paying';
--> statement-breakpoint

DROP TYPE "member_dues_kind_old";
