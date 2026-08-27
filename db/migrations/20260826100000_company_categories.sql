-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- Create the company_categories join table, carry the existing single category
-- across, and relax the old column so a company may hold several categories.
-- The rollback lives in the matching .down.sql - the runner in
-- tests/setup/migrations.ts applies this whole file, so a DOWN section kept
-- here would undo the UP the moment it ran.
CREATE TABLE IF NOT EXISTS company_categories (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  business_category_id integer NOT NULL REFERENCES business_categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (company_id, business_category_id)
);

CREATE INDEX IF NOT EXISTS company_categories_category_idx
  ON company_categories (business_category_id);

INSERT INTO company_categories (company_id, business_category_id)
  SELECT id, business_category_id
  FROM companies
  WHERE business_category_id IS NOT NULL
  ON CONFLICT DO NOTHING;

ALTER TABLE companies ALTER COLUMN business_category_id DROP NOT NULL;
