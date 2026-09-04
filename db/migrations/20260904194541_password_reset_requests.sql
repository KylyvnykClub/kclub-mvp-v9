SET lock_timeout = '3s';
--> statement-breakpoint
SET statement_timeout = '30s';
--> statement-breakpoint
-- The member's half of account recovery (FR-006, ADR 0031): a queue of people
-- asking staff to reset a password. Holds no secret and grants nothing; the
-- reset itself stays an owner-only action with its own audit entry.
CREATE TYPE "public"."password_reset_request_status" AS ENUM('open', 'handled', 'dismissed');--> statement-breakpoint
CREATE TABLE "password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_id" uuid NOT NULL,
	"phone" varchar(20) NOT NULL,
	"status" "password_reset_request_status" DEFAULT 'open' NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" uuid
);
--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_handled_by_members_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_requests_status_idx" ON "password_reset_requests" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_requests_one_open_idx" ON "password_reset_requests" USING btree ("member_id") WHERE "password_reset_requests"."status" = 'open';