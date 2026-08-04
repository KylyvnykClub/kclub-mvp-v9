SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- Outbox: transactional messaging (architecture.md §4, data-storage.md §6).
-- Domain writes and the intent to notify/enqueue commit in the same transaction;
-- a dispatcher drains with SELECT FOR UPDATE SKIP LOCKED.
CREATE TABLE outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  topic         text NOT NULL,
  payload       jsonb NOT NULL,
  processed_at  timestamptz
);

CREATE INDEX idx_outbox_pending
  ON outbox (created_at)
  WHERE processed_at IS NULL;

-- Feature flags: database-backed kill switches (reliability.md §5).
-- Effective within 30 seconds, changeable by staff_owner without a deploy.
CREATE TABLE feature_flag (
  name        text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_flag (name, enabled) VALUES
  ('signup_enabled',    true),
  ('sms_enabled',       true),
  ('referrals_enabled', true),
  ('checkout_enabled',  true),
  ('maintenance_mode',  false);
