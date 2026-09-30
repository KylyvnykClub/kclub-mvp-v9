-- ADR 0040: the owner can hand a business a free listing link.
--
-- Two facts. Which door a join link is (`join_links.kind`: a member link makes
-- a sponsored member, a partner link a partner whose listing costs nothing),
-- and on the company, that its listing was waived by such a link
-- (`listing_waived_at`, `listing_waiver_link_id`). The waiver lives on the
-- company because the listing is the thing that is free - an account can own
-- other listings that are not.

CREATE TYPE "join_link_kind" AS ENUM ('member', 'partner');
--> statement-breakpoint

-- Every existing link is the member link ADR 0033 introduced.
ALTER TABLE "join_links"
  ADD COLUMN "kind" "join_link_kind" NOT NULL DEFAULT 'member';
--> statement-breakpoint

-- One live door per kind, instead of one in all.
DROP INDEX IF EXISTS "join_links_one_active";
--> statement-breakpoint

CREATE UNIQUE INDEX "join_links_one_active_per_kind" ON "join_links" ("kind") WHERE "active";
--> statement-breakpoint

-- Deleted with the company (no separate retention). The link reference is
-- kept for the audit trail of which door waived it, and survives the link
-- being revoked; it is nulled only if the link row itself is deleted.
ALTER TABLE "companies" ADD COLUMN "listing_waived_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "companies"
  ADD COLUMN "listing_waiver_link_id" uuid REFERENCES "join_links"("id") ON DELETE SET NULL;
