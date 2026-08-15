import { describe, expect, it } from "vitest";

import {
  PROHIBITED_CATEGORY_KEYWORDS,
  isProhibitedCategory,
} from "./prohibited-categories";

/**
 * FR-041 (second half): the system must reject a submission whose category is
 * on the prohibited list. The city-country half is proved against a real
 * database in tests/company-moderation.integration.test.ts.
 */

describe("FR-041: prohibited business categories", () => {
  it("rejects a category whose block names a prohibited business", () => {
    expect(
      isProhibitedCategory({
        block: "Gambling",
        category: "Betting",
        subcategory: "Sports",
      }),
    ).toBe(true);
  });

  it("rejects a keyword that appears only in the deepest level of the path", () => {
    expect(
      isProhibitedCategory({
        block: "Finance",
        category: "Exchange",
        subcategory: "Cryptocurrency trading",
      }),
    ).toBe(true);
  });

  it("matches regardless of case", () => {
    expect(isProhibitedCategory({ subcategory: "CASINO resort" })).toBe(true);
  });

  it("accepts an ordinary category", () => {
    expect(
      isProhibitedCategory({
        block: "Services",
        category: "Food and drink",
        subcategory: "Coffee shop",
      }),
    ).toBe(false);
  });

  it("tolerates a partial path rather than throwing on a missing level", () => {
    expect(isProhibitedCategory({})).toBe(false);
    expect(isProhibitedCategory({ block: null, category: undefined })).toBe(
      false,
    );
  });

  it("covers every keyword on the list, so none is dead configuration", () => {
    for (const keyword of PROHIBITED_CATEGORY_KEYWORDS) {
      expect(isProhibitedCategory({ subcategory: keyword })).toBe(true);
    }
  });
});
