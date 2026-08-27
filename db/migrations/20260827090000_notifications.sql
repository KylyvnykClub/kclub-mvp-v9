-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- The member-facing inbox (FR-099, ADR 0020). The rollback lives in the
-- matching .down.sql - the runner in tests/setup/migrations.ts applies this
-- whole file, so a DOWN section kept here would drop the table it just made.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_kind') THEN
    CREATE TYPE notification_kind AS ENUM (
      'welcome',
      'company_approved',
      'company_rejected',
      'referral_received',
      'payment_failed',
      'grace_expiry_warning'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind notification_kind NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  dedupe_key varchar(255)
);

-- The inbox listing: one member's rows, newest first.
CREATE INDEX IF NOT EXISTS notifications_member_created_idx
  ON notifications (member_id, created_at DESC);

-- The unread badge runs on every dashboard render. Partial, so it stays small
-- as read history accumulates behind it.
CREATE INDEX IF NOT EXISTS notifications_member_unread_idx
  ON notifications (member_id)
  WHERE read_at IS NULL;

-- Idempotency for rows written outside a user's own request, such as a
-- redelivered Stripe webhook. Partial, so the many rows that legitimately carry
-- no key do not collide with each other on a single null.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
