-- ADR 0044: a business applies with explicit, recorded consents; a business
-- invited through a member's partner link saves a card and gets one free month
-- from publication.
--
-- `consent_records` holds the words each box said when it was ticked.
-- `listing_activations` is the one-row-per-company record of a listing paid by
-- a saved card: card saved, published, subscription started. On `companies`,
-- the route the server decided and the owner's withdrawal.

CREATE TYPE "application_route" AS ENUM ('public', 'invite');
--> statement-breakpoint

CREATE TYPE "consent_kind" AS ENUM (
  'terms', 'payment_authority', 'publication', 'marketing', 'eu_early_start', 'eu_withdrawal'
);
--> statement-breakpoint

CREATE TABLE "consent_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "member_id" uuid REFERENCES "members"("id") ON DELETE SET NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "kind" "consent_kind" NOT NULL,
  "route" "application_route" NOT NULL,
  "wording" varchar(32),
  "text_version" varchar(32) NOT NULL,
  "text_hash" varchar(64) NOT NULL,
  "text" text NOT NULL,
  "locale" varchar(8) NOT NULL,
  "residence_country" varchar(2),
  "invite_link_id" uuid REFERENCES "invite_links"("id") ON DELETE SET NULL,
  "ip_address" inet,
  "user_agent" varchar(512),
  "accepted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint

-- The checkout gate asks "is there a payment authority for this company".
CREATE INDEX "consent_records_company_kind_idx" ON "consent_records" ("company_id", "kind");
--> statement-breakpoint

CREATE TABLE "listing_activations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "company_id" uuid NOT NULL UNIQUE REFERENCES "companies"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "route" "application_route" NOT NULL,
  "free_month" boolean NOT NULL,
  "start_not_before" timestamp with time zone,
  "stripe_customer_id" varchar(255),
  "setup_checkout_session_id" varchar(255),
  "setup_intent_id" varchar(255),
  "payment_method_id" varchar(255),
  "card_saved_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "trial_ends_at" timestamp with time zone,
  "stripe_subscription_id" varchar(255) UNIQUE,
  "first_paid_at" timestamp with time zone,
  "stripe_updated_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "companies"
  ADD COLUMN "application_route" varchar(16),
  ADD COLUMN "application_invite_link_id" uuid REFERENCES "invite_links"("id") ON DELETE SET NULL,
  ADD COLUMN "withdrawn_at" timestamp with time zone,
  ADD CONSTRAINT "companies_application_route_known"
    CHECK ("application_route" IS NULL OR "application_route" IN ('public', 'invite'));
