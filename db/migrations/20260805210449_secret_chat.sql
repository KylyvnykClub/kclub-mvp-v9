CREATE TYPE "public"."referral_status" AS ENUM('pending_review', 'rejected', 'delivered', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_company_id" uuid NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"contact_channel" text,
	"service_needed" text NOT NULL,
	"note" text,
	"status" "referral_status" DEFAULT 'pending_review' NOT NULL,
	"consent_attested" boolean DEFAULT false NOT NULL,
	"consent_timestamp" timestamp with time zone,
	"moderator_id" uuid,
	"moderation_reason" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "locale" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "can_send_referrals" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "country" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_sender_id_members_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_recipient_company_id_companies_id_fk" FOREIGN KEY ("recipient_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_moderator_id_members_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;