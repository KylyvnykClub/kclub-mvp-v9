DROP INDEX IF EXISTS "company_service_countries_country_code_idx";
DROP TABLE IF EXISTS "company_service_countries";
DROP TABLE IF EXISTS "business_category_translations";

ALTER TABLE "companies"
  DROP COLUMN IF EXISTS "serves_worldwide",
  DROP COLUMN IF EXISTS "specialization_description",
  DROP COLUMN IF EXISTS "administrative_level_2",
  DROP COLUMN IF EXISTS "administrative_level_1",
  DROP COLUMN IF EXISTS "business_format",
  DROP COLUMN IF EXISTS "registration_country_code";

DROP TYPE IF EXISTS "business_format";
