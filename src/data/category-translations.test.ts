import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { parseCategoryTranslations } from "../../tools/category-translations-sync";

/**
 * Interface parity (requirements.md §5, Languages): the classifier file is the source every locale's
 * taxonomy is loaded from. A Ukrainian name that is the Russian one copied
 * over is a screen in the wrong language, so it is caught here, not by a
 * partner reading it.
 */
const rows = parseCategoryTranslations(
  readFileSync(
    path.join(process.cwd(), "data", "business_category_translations.csv"),
    "utf-8",
  ),
);

describe("i18n parity: classifier translations", () => {
  it("every category has exactly one en, ru and uk row", () => {
    const locales = new Map<number, string[]>();
    for (const row of rows) {
      locales.set(row.businessCategoryId, [
        ...(locales.get(row.businessCategoryId) ?? []),
        row.locale,
      ]);
    }
    for (const found of locales.values()) {
      expect(found.sort()).toEqual(["en", "ru", "uk"]);
    }
  });

  it("no Ukrainian subcategory is the Russian text copied over", () => {
    const ru = new Map(
      rows
        .filter((row) => row.locale === "ru")
        .map((row) => [row.businessCategoryId, row.subcategory]),
    );
    // Names spelt the same in both languages are not copies.
    const shared = new Set([
      "AI-консалтинг",
      "Email-маркетинг",
      "SEO-аудит",
      "UX/UI-дизайн",
      "Апостиль",
      "Аутсорсинг",
      "Брендбук",
      "Дизайн упаковки",
      "Каталог франшиз",
      "Лендинги",
      "Логотип",
      "Монтаж",
      "Монтаж труб",
      "Онлайн-формат",
      "Ремонт",
      "Ремонт CVT",
      "Репетиторство",
      "Телемедицина",
    ]);
    const copied = rows.filter(
      (row) =>
        row.locale === "uk" &&
        row.subcategory === ru.get(row.businessCategoryId) &&
        !shared.has(row.subcategory) &&
        !/^[\p{Script=Latin}\d\s\-/&]+$/u.test(row.subcategory),
    );
    expect(copied.map((row) => row.subcategory)).toEqual([]);
  });
});
