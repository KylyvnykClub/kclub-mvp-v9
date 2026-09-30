-- Back to one member link and no waivers. A waived listing loses its waiver,
-- which is the safe direction: it is then unpaid and leaves the catalogue
-- rather than staying live for free.
ALTER TABLE "companies" DROP COLUMN IF EXISTS "listing_waiver_link_id";
--> statement-breakpoint

ALTER TABLE "companies" DROP COLUMN IF EXISTS "listing_waived_at";
--> statement-breakpoint

DROP INDEX IF EXISTS "join_links_one_active_per_kind";
--> statement-breakpoint

-- Only member links survive the rollback: a partner link would otherwise come
-- back as a second live member link and break the index below.
DELETE FROM "join_links" WHERE "kind" = 'partner';
--> statement-breakpoint

ALTER TABLE "join_links" DROP COLUMN IF EXISTS "kind";
--> statement-breakpoint

DROP TYPE IF EXISTS "join_link_kind";
--> statement-breakpoint

CREATE UNIQUE INDEX "join_links_one_active" ON "join_links" ("active") WHERE "active";
