-- Postgres cannot drop an enum value, so the type is rebuilt without it. A VIP
-- link is removed first; members it admitted keep their sponsored dues and
-- their VIP card, which are ordinary columns.
DELETE FROM "join_links" WHERE "kind" = 'vip';
--> statement-breakpoint

ALTER TYPE "join_link_kind" RENAME TO "join_link_kind_old";
--> statement-breakpoint

CREATE TYPE "join_link_kind" AS ENUM ('member', 'partner');
--> statement-breakpoint

ALTER TABLE "join_links" ALTER COLUMN "kind" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "join_links"
  ALTER COLUMN "kind" TYPE "join_link_kind" USING "kind"::text::"join_link_kind";
--> statement-breakpoint

ALTER TABLE "join_links" ALTER COLUMN "kind" SET DEFAULT 'member';
--> statement-breakpoint

DROP TYPE "join_link_kind_old";
