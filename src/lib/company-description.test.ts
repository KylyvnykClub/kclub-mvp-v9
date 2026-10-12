import { describe, expect, it } from "vitest";

import { descriptionTranslationsFrom } from "@/modules/catalogue/submit-company";
import { localizedDescription } from "./company-description";

/**
 * ADR 0046 / FR-033: the partner page shows the partner's own description,
 * in the reader's language when the partner wrote one in it.
 */
describe("FR-033: the description in the reader's language", () => {
  const company = {
    description: "Бухгалтерський супровід бізнесу",
    descriptionTranslations: { en: "Accounting for businesses" },
  };

  it("FR-033: shows the partner's version in the reader's language", () => {
    expect(localizedDescription(company, "en")).toBe(
      "Accounting for businesses",
    );
  });

  it("FR-033: falls back to what the partner wrote first", () => {
    expect(localizedDescription(company, "ru")).toBe(
      "Бухгалтерський супровід бізнесу",
    );
    expect(
      localizedDescription(
        { description: "Only one", descriptionTranslations: null },
        "uk",
      ),
    ).toBe("Only one");
  });

  it("FR-033: a blank version is no version", () => {
    expect(
      descriptionTranslationsFrom({
        descriptionEn: "  ",
        descriptionUk: "Опис",
        descriptionRu: undefined,
      }),
    ).toEqual({ uk: "Опис" });
  });
});
