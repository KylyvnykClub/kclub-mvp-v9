CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
DECLARE
  category_text text;
BEGIN
  SELECT coalesce(category, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(block, '')
    INTO category_text FROM business_categories WHERE id = NEW.business_category_id;
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '') || ' ' || coalesce(NEW.specialization_description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.city, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_search_vector_trigger ON "companies";
CREATE TRIGGER companies_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, specialization_description, city, business_category_id ON "companies"
  FOR EACH ROW EXECUTE FUNCTION companies_search_vector_update();

ALTER TABLE "companies" DROP COLUMN IF EXISTS "description_translations";
