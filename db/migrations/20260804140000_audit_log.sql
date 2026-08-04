SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE TABLE audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL    DEFAULT now(),
  actor_type    text        NOT NULL,
  actor_id      text,
  action        text        NOT NULL,
  subject_type  text        NOT NULL,
  subject_id    text        NOT NULL,
  meta          jsonb,
  ip            text,
  user_agent    text,
  correlation_id text
);

CREATE INDEX idx_audit_log_actor    ON audit_log (actor_type, actor_id);
CREATE INDEX idx_audit_log_subject  ON audit_log (subject_type, subject_id);
CREATE INDEX idx_audit_log_created  ON audit_log (created_at);

-- The application role may INSERT but never UPDATE or DELETE audit rows.
-- This is the single most useful security control: even a compromised
-- code path cannot rewrite its own trail (security.md §7).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN;
  END IF;
END
$$;

GRANT SELECT, INSERT ON audit_log TO app_rw;
-- Explicitly: no UPDATE, no DELETE.
