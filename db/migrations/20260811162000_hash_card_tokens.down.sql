ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "cards_token_hash_unique";
--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN IF EXISTS "token_hash";
