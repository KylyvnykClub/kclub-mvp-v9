/**
 * Bring `business_category_translations` in line with
 * `data/business_category_translations.csv`, the file the classifier is
 * edited in. Only rows that already exist and differ are rewritten - nothing
 * is inserted, so a production database whose taxonomy is older than the file
 * is never handed a translation for a category it does not have.
 *
 * Idempotent: on every build after the first it finds nothing to change.
 */

import fs from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";

import type { DbClient } from "../src/data/db";

type TranslationRow = {
  businessCategoryId: number;
  locale: string;
  block: string;
  category: string;
  subcategory: string;
};

export function parseCategoryTranslations(content: string): TranslationRow[] {
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(1)
    .map((line) => {
      const parts = line
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((part) => part.trim().replace(/^"|"$/g, "").replaceAll('""', '"'));
      if (parts.length !== 5 || parts.some((part) => !part)) {
        throw new Error(`Invalid classifier translation: ${line}`);
      }
      return {
        businessCategoryId: Number(parts[0]!),
        locale: parts[1]!,
        block: parts[2]!,
        category: parts[3]!,
        subcategory: parts[4]!,
      };
    });
}

export async function syncCategoryTranslations(
  db: DbClient,
  log: (line: string) => void,
): Promise<number> {
  const content = await fs.readFile(
    path.join(process.cwd(), "data", "business_category_translations.csv"),
    "utf-8",
  );
  const rows = parseCategoryTranslations(content);

  let changed = 0;
  const chunkSize = 300;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const values = sql.join(
      rows
        .slice(i, i + chunkSize)
        .map(
          (row) =>
            sql`(${row.businessCategoryId}::integer, ${row.locale}::varchar, ${row.block}::varchar, ${row.category}::varchar, ${row.subcategory}::varchar)`,
        ),
      sql`, `,
    );
    const result = await db.execute(sql`
      UPDATE "business_category_translations" AS t
      SET "block" = v.block, "category" = v.category, "subcategory" = v.subcategory
      FROM (VALUES ${values}) AS v(id, locale, block, category, subcategory)
      WHERE t."business_category_id" = v.id
        AND t."locale" = v.locale
        AND (t."block", t."category", t."subcategory")
          IS DISTINCT FROM (v.block, v.category, v.subcategory)
    `);
    changed += result.rowCount ?? 0;
  }

  log(`classifier translations: ${changed} updated`);
  return changed;
}
