-- Baseline migration: enable extensions needed by the schema.
--
-- pgcrypto provides gen_random_uuid() for UUIDv4 default values.
-- pg_trgm provides trigram matching for catalogue search (ADR 0006).

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
