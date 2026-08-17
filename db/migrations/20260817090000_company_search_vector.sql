-- FR-032 / ADR 0006: catalogue search ranked by relevance.
--
-- Company content is free text mixed across English, Russian and Ukrainian in
-- a single name/description (no per-locale columns, no language marker on the
-- row), and PostgreSQL ships no built-in "ukrainian" text search
-- configuration. "simple" tokenizes and normalises without stemming, which
-- treats all three languages the same way rather than degrading Ukrainian
-- alone - see the addendum in decisions/0006-postgres-full-text-search.md.

ALTER TABLE "companies" ADD COLUMN "search_vector" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
DECLARE
  category_text text;
BEGIN
  SELECT coalesce(category, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(block, '')
    INTO category_text
    FROM business_categories
    WHERE id = NEW.business_category_id;

  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.city, '')), 'D');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER companies_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, city, business_category_id ON "companies"
  FOR EACH ROW EXECUTE FUNCTION companies_search_vector_update();
--> statement-breakpoint
UPDATE "companies" SET name = name;
--> statement-breakpoint
CREATE INDEX "companies_search_vector_idx" ON "companies" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING gin ("name" gin_trgm_ops);
