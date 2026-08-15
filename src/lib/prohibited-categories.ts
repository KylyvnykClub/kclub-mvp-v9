/**
 * Categories a company may not be listed under (FR-041).
 *
 * Kept out of the Server Action file so the rule can be tested directly rather
 * than only through a submission, and so the marketing and moderation surfaces
 * can consult the same list rather than keeping their own.
 */
export const PROHIBITED_CATEGORY_KEYWORDS = [
  "gambling",
  "casino",
  "cryptocurrency",
  "crypto",
  "token",
  "weapons",
  "firearms",
  "adult",
  "pornography",
  "unlicensed financial",
  "high-risk investment",
] as const;

/**
 * True when any part of the category path names a prohibited business.
 *
 * Matching is a case-insensitive substring over the joined path, so a keyword
 * buried in a subcategory ("Crypto exchange") is caught as readily as one that
 * names the whole block.
 */
export function isProhibitedCategory(path: {
  block?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): boolean {
  const text = [path.block, path.category, path.subcategory]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  return PROHIBITED_CATEGORY_KEYWORDS.some((keyword) => text.includes(keyword));
}
