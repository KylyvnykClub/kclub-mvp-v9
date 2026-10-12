-- ADR 0046: a partner's description in the club's other languages, written by
-- the partner. `description` stays what they wrote first; this holds the
-- versions they added, keyed by locale.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "description_translations" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Search covers every language the partner wrote in (FR-032), at the same
-- weight as the description itself.
CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
DECLARE
  category_text text;
BEGIN
  SELECT coalesce(category, '') || ' ' || coalesce(subcategory, '') || ' ' || coalesce(block, '')
    INTO category_text FROM business_categories WHERE id = NEW.business_category_id;
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category_text, '')), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(NEW.description, '') || ' ' ||
      coalesce(NEW.specialization_description, '') || ' ' ||
      coalesce(NEW.description_translations->>'en', '') || ' ' ||
      coalesce(NEW.description_translations->>'ru', '') || ' ' ||
      coalesce(NEW.description_translations->>'uk', '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.city, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_search_vector_trigger ON "companies";
CREATE TRIGGER companies_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description, specialization_description, description_translations, city, business_category_id ON "companies"
  FOR EACH ROW EXECUTE FUNCTION companies_search_vector_update();
