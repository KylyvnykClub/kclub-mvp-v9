-- ADR 0042: members bring people in through personal invite links, and the
-- club records who brought whom - one level, written once at registration.
--
-- `invite_links` are a member's own links (unlike `join_links`, which are the
-- club's and anonymous). `invitations` is one row per invitee: the primary key
-- makes a second attribution impossible rather than unlikely. On the company,
-- `listing_waiver_invite_link_id` records that an invite link waived the
-- listing, next to the join-link reference ADR 0040 added.

CREATE TYPE "invite_link_kind" AS ENUM ('member', 'partner');
--> statement-breakpoint

CREATE TYPE "inviter_standing" AS ENUM ('partner', 'vip', 'member');
--> statement-breakpoint

CREATE TABLE "invite_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "kind" "invite_link_kind" NOT NULL,
  "code" text NOT NULL UNIQUE,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint

-- One live link of each kind per member; rotation is revoke-then-insert.
CREATE UNIQUE INDEX "invite_links_one_active_per_owner_kind"
  ON "invite_links" ("owner_member_id", "kind") WHERE "active";
--> statement-breakpoint

CREATE TABLE "invitations" (
  "invitee_member_id" uuid PRIMARY KEY NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "inviter_member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
  "invite_link_id" uuid REFERENCES "invite_links"("id") ON DELETE SET NULL,
  "kind" "invite_link_kind" NOT NULL,
  "inviter_standing" "inviter_standing" NOT NULL,
  "waived" boolean NOT NULL,
  -- A partner link waives one listing; this says it has been used.
  "waiver_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invitations_not_self" CHECK ("inviter_member_id" IS DISTINCT FROM "invitee_member_id")
);
--> statement-breakpoint

-- The inviter's counts are read on every cabinet visit.
CREATE INDEX "invitations_inviter_idx" ON "invitations" ("inviter_member_id");
--> statement-breakpoint

ALTER TABLE "companies"
  ADD COLUMN "listing_waiver_invite_link_id" uuid REFERENCES "invite_links"("id") ON DELETE SET NULL;
