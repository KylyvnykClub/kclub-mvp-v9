CREATE TYPE "business_format" AS ENUM ('offline_only', 'online_only', 'online_offline', 'on_site_service');

ALTER TABLE "companies"
  ADD COLUMN "registration_country_code" varchar(2),
  ADD COLUMN "business_format" "business_format",
  ADD COLUMN "administrative_level_1" varchar(255),
  ADD COLUMN "administrative_level_2" varchar(255),
  ADD COLUMN "specialization_description" varchar(500),
  ADD COLUMN "serves_worldwide" integer DEFAULT 0 NOT NULL;

CREATE TABLE "business_category_translations" (
  "business_category_id" integer NOT NULL REFERENCES "business_categories"("id") ON DELETE CASCADE,
  "locale" varchar(2) NOT NULL,
  "block" varchar(255) NOT NULL,
  "category" varchar(255) NOT NULL,
  "subcategory" varchar(255) NOT NULL,
  CONSTRAINT "business_category_translations_pkey" PRIMARY KEY ("business_category_id", "locale")
);

CREATE TABLE "company_service_countries" (
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "country_code" varchar(2) NOT NULL,
  CONSTRAINT "company_service_countries_pkey" PRIMARY KEY ("company_id", "country_code")
);

CREATE INDEX "company_service_countries_country_code_idx"
  ON "company_service_countries" ("country_code");

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

UPDATE "companies" SET name = name;
