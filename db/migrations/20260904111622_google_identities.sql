SET lock_timeout = '3s';
--> statement-breakpoint
SET statement_timeout = '30s';
--> statement-breakpoint
-- External accounts a member may sign in through (ADR 0029). One provider
-- account belongs to one member, and one member holds at most one account per
-- provider; both are unique indexes rather than conventions.
CREATE TYPE "public"."identity_provider" AS ENUM('google');--> statement-breakpoint
CREATE TABLE "member_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_account_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_identities" ADD CONSTRAINT "member_identities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_identities_provider_account_idx" ON "member_identities" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_identities_member_provider_idx" ON "member_identities" USING btree ("member_id","provider");