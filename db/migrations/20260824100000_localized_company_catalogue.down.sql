DROP INDEX IF EXISTS "company_service_countries_country_code_idx";
DROP TABLE IF EXISTS "company_service_countries";
DROP TABLE IF EXISTS "business_category_translations";

DROP TRIGGER IF EXISTS companies_search_vector_trigger ON "companies";
CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
DECLARE
  category_text text;
BEGIN
  SELECT coalesce(category, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(block, '')
    INTO category_text FROM business_categories WHERE id = NEW.business_category_id;
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.city, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER companies_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, city, business_category_id ON "companies"
  FOR EACH ROW EXECUTE FUNCTION companies_search_vector_update();

ALTER TABLE "companies"
  DROP COLUMN IF EXISTS "serves_worldwide",
  DROP COLUMN IF EXISTS "specialization_description",
  DROP COLUMN IF EXISTS "administrative_level_2",
  DROP COLUMN IF EXISTS "administrative_level_1",
  DROP COLUMN IF EXISTS "business_format",
  DROP COLUMN IF EXISTS "registration_country_code";

DROP TYPE IF EXISTS "business_format";
