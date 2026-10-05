-- Back to no invite programme. A listing waived by an invite link keeps its
-- `listing_waived_at`: it was granted, and withdrawing it is a staff decision
-- (ADR 0041), not a side effect of a rollback.
ALTER TABLE "companies" DROP COLUMN IF EXISTS "listing_waiver_invite_link_id";
--> statement-breakpoint

DROP TABLE IF EXISTS "invitations";
--> statement-breakpoint

DROP TABLE IF EXISTS "invite_links";
--> statement-breakpoint

DROP TYPE IF EXISTS "inviter_standing";
--> statement-breakpoint

DROP TYPE IF EXISTS "invite_link_kind";
