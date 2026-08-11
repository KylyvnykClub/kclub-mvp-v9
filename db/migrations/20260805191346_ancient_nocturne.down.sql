ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_slug_unique";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "contact_phone";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "contact_email";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "logo_url";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "discount";
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "slug";
