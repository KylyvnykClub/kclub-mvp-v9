ALTER TYPE "public"."member_role" ADD VALUE 'staff_support';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'staff_moderator';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'staff_admin';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'staff_owner';--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_partial_session" boolean DEFAULT false NOT NULL;