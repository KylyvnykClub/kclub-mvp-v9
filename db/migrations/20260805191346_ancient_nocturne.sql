ALTER TABLE "companies" ADD COLUMN "slug" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "discount" varchar(255);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_slug_unique" UNIQUE("slug");