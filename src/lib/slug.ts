/**
 * A company's public address in the catalogue (FR-040).
 *
 * Kept out of the Server Action file so it can be tested directly, and so the
 * one place that decides what a company is called in a URL is the same for
 * every alphabet the product is offered in.
 *
 * Cyrillic follows the Ukrainian national transliteration (KMU 55/2010), which
 * also reads acceptably for Russian: й/є/ї/ю/я are romanised differently at the
 * start of a word than inside one.
 */

/** Longest slug the `companies.slug` column holds. */
export const COMPANY_SLUG_MAX_LENGTH = 255;

/**
 * Used when a name romanises to nothing at all - a name written entirely in a
 * script this table does not cover. An unreadable slug is a poor address; an
 * empty one is not an address at all, and the caller's uniqueness loop cannot
 * tell two of them apart.
 */
export const COMPANY_SLUG_FALLBACK = "company";

const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  ё: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
};

/** Same letters, romanised as they are when they open a word. */
const CYRILLIC_WORD_INITIAL: Record<string, string> = {
  є: "ye",
  ї: "yi",
  й: "y",
  ю: "yu",
  я: "ya",
};

export function companySlug(name: string): string {
  let romanised = "";
  let wordInitial = true;

  for (const character of name.toLowerCase()) {
    if (!/[\p{L}\p{N}]/u.test(character)) {
      romanised += "-";
      wordInitial = true;
      continue;
    }

    romanised +=
      (wordInitial ? CYRILLIC_WORD_INITIAL[character] : undefined) ??
      CYRILLIC[character] ??
      character;
    wordInitial = false;
  }

  const slug = romanised
    // Accented latin folds to its base letter rather than being dropped.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, COMPANY_SLUG_MAX_LENGTH)
    .replace(/-+$/, "");

  return slug || COMPANY_SLUG_FALLBACK;
}
