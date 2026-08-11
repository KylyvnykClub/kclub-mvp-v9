ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_token_hash_unique";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "token_hash";
