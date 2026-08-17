DROP INDEX "companies_name_trgm_idx";
--> statement-breakpoint
DROP INDEX "companies_search_vector_idx";
--> statement-breakpoint
DROP TRIGGER companies_search_vector_trigger ON "companies";
--> statement-breakpoint
DROP FUNCTION companies_search_vector_update();
--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "search_vector";
