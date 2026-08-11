ALTER TABLE "sessions" ADD COLUMN "token_hash" text;--> statement-breakpoint
UPDATE "sessions"
SET "token_hash" = encode(digest('kclub.session.v1.' || "token", 'sha256'), 'hex')
WHERE "token_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash");
