CREATE TABLE IF NOT EXISTS "plan_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan" text NOT NULL,
  "stripe_price_id" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  CONSTRAINT "plan_prices_created_by_members_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."members"("id")
    ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_plan_prices_current"
  ON "plan_prices" ("plan", "active", "effective_from" DESC);
