ALTER TABLE "companies" DROP COLUMN IF EXISTS "special_privileges_note";
--> statement-breakpoint

ALTER TABLE "companies" DROP COLUMN IF EXISTS "special_privileges";
--> statement-breakpoint

DROP TABLE IF EXISTS "listing_holds";
