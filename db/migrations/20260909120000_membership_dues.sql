-- ADR 0033: standard membership costs money, and a join link waives it.
--
-- Three facts arrive here. Who owes dues (`members.dues_kind`), which product a
-- subscription is for (`subscriptions.plan`, until now inferred from whether a
-- company was attached), and the club's current join link (`join_links`).

CREATE TYPE "member_dues_kind" AS ENUM ('paying', 'sponsored', 'legacy_free');
--> statement-breakpoint

-- `paying` is the default on purpose: a future code path that forgets this
-- column creates a member who owes money rather than one who is let in free.
ALTER TABLE "members"
  ADD COLUMN "dues_kind" "member_dues_kind" NOT NULL DEFAULT 'paying';
--> statement-breakpoint

-- Everyone who is already here was promised free membership and keeps it. This
-- runs in the same migration as the column, so there is no window in which an
-- existing member is `paying`.
UPDATE "members" SET "dues_kind" = 'legacy_free';
--> statement-breakpoint

CREATE TYPE "subscription_plan" AS ENUM ('membership', 'vip', 'listing');
--> statement-breakpoint

ALTER TABLE "subscriptions" ADD COLUMN "plan" "subscription_plan";
--> statement-breakpoint

-- Before this column, "a member subscription with no company" meant VIP and
-- nothing else. That was true until dues existed, so it is exactly the
-- backfill.
UPDATE "subscriptions"
  SET "plan" = CASE WHEN "company_id" IS NULL THEN 'vip'::"subscription_plan"
                    ELSE 'listing'::"subscription_plan" END;
--> statement-breakpoint

-- No default: the projection resolves the plan from the price and must say
-- which one it means.
ALTER TABLE "subscriptions" ALTER COLUMN "plan" SET NOT NULL;
--> statement-breakpoint

CREATE TABLE "join_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "secret" text NOT NULL UNIQUE,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "members"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint

-- One live door at a time (ADR 0033). A partial unique index rather than a
-- check, so rotation is "revoke, then insert" and a second active row is
-- refused by the database instead of by whoever remembers.
CREATE UNIQUE INDEX "join_links_one_active" ON "join_links" ("active") WHERE "active";
