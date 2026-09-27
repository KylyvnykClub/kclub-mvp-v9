-- ADR 0037: a partner's card is held at application and charged on approval.
--
-- `listing_holds` is the projection of one manually captured PaymentIntent per
-- attempt. Like `subscriptions`, every column but the ids is re-read from the
-- Stripe API on a `payment_intent.*` event, and `stripe_updated_at` is the
-- event watermark that discards a late delivery (ADR 0004, FR-053).
--
-- A captured hold pays for the listing's first month, so while `covers_until`
-- is in the future it publishes the company the way an access-granting
-- subscription does. Rows go with their company or their member: the money
-- itself is recorded in Stripe, which is the system of record.
CREATE TABLE IF NOT EXISTS "listing_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stripe_payment_intent_id" varchar(255) NOT NULL,
  "company_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "stripe_customer_id" varchar(255) NOT NULL,
  "status" varchar(50) NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "capture_before" timestamp with time zone,
  "capture_requested_at" timestamp with time zone,
  "captured_at" timestamp with time zone,
  "covers_until" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "stripe_subscription_id" varchar(255),
  "stripe_updated_at" timestamp with time zone,
  CONSTRAINT "listing_holds_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
  CONSTRAINT "listing_holds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade,
  CONSTRAINT "listing_holds_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE cascade
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "listing_holds_company_id_idx" ON "listing_holds" ("company_id");
--> statement-breakpoint

-- FR-117: a partner may offer members "special privileges" beyond a discount,
-- optionally saying which. Existing partners offer none until they say so.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "special_privileges" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "special_privileges_note" varchar(500);
