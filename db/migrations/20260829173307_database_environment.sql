SET lock_timeout = '3s';
--> statement-breakpoint
SET statement_timeout = '30s';
--> statement-breakpoint
-- Which environment this database IS, not where the app runs (ADR 0026).
-- One row, no default row: a fresh database is unmarked. Written only by
-- tools/db-mark-environment.ts and tools/db-reset-dev.ts. Holds no personal data.
CREATE TABLE "database_environment" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marked_by" text,
	CONSTRAINT "database_environment_singleton" CHECK ("database_environment"."singleton"),
	CONSTRAINT "database_environment_name" CHECK ("database_environment"."name" in ('production', 'dev', 'preview', 'test'))
);
