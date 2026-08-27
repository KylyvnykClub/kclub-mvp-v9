-- NOTE: hand-written migration. Do not use semicolons inside comments.

-- Repair the companies whose name slugged to nothing.
--
-- The generator kept only [a-z0-9], so a name written in Cyrillic produced the
-- empty string. companies.slug is unique, so the first such company took the
-- empty address and every later one collided with it - and its own catalogue
-- URL did not resolve. The generator is fixed in src/lib/slug.ts, which this
-- backfill cannot call, so the repaired rows get a stable address derived from
-- their id. It is not pretty, but it is unique, permanent and resolvable, and
-- staff can rename it from the admin screen.
UPDATE companies
  SET slug = 'company-' || left(replace(id::text, '-', ''), 12)
  WHERE slug = ''
