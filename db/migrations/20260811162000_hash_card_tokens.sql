ALTER TABLE "cards" ADD COLUMN "token_hash" text;--> statement-breakpoint
UPDATE "cards"
SET "token_hash" = encode(digest('kclub.card.v1.' || "token", 'sha256'), 'hex')
WHERE "token_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_token_hash_unique" UNIQUE("token_hash");
