-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- UP: create company_categories join table, migrate existing data, drop old FK
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

-- DOWN: restore NOT NULL, drop join table
UPDATE companies SET business_category_id = (
  SELECT cc.business_category_id FROM company_categories cc
  WHERE cc.company_id = companies.id
  LIMIT 1
) WHERE business_category_id IS NULL;

ALTER TABLE companies ALTER COLUMN business_category_id SET NOT NULL;

DROP INDEX IF EXISTS company_categories_category_idx;
DROP TABLE IF EXISTS company_categories;
