-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- Restore the single-category column from the join table, then drop the join
-- table. A company that gained several categories keeps an arbitrary one - the
-- rollback cannot be exact, because the forward migration widened the model.
UPDATE companies SET business_category_id = (
  SELECT cc.business_category_id FROM company_categories cc
  WHERE cc.company_id = companies.id
  LIMIT 1
) WHERE business_category_id IS NULL;

ALTER TABLE companies ALTER COLUMN business_category_id SET NOT NULL;

DROP INDEX IF EXISTS company_categories_category_idx;

DROP TABLE IF EXISTS company_categories;
