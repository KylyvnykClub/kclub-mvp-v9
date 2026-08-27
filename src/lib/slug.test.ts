import { describe, expect, it } from "vitest";

import { companySlug } from "./slug";

/**
 * FR-040: a company's slug is its public address in the catalogue.
 *
 * The first version stripped everything outside [a-z0-9], which for a Ukrainian
 * or Russian company name is the whole name - one such company reached
 * production with an empty slug, and a second would have collided with it.
 */
describe("FR-040: company slug", () => {
  it("keeps a latin name readable", () => {
    expect(companySlug("Acme Coffee Roasters")).toBe("acme-coffee-roasters");
  });

  it("transliterates a Ukrainian name instead of erasing it", () => {
    expect(companySlug("Юридична Компанія «Киливник та партнери»")).toBe(
      "yurydychna-kompaniia-kylyvnyk-ta-partnery",
    );
  });

  it("transliterates a Russian name instead of erasing it", () => {
    expect(companySlug("ООО Ромашка")).toBe("ooo-romashka");
  });

  it("never returns an empty slug, whatever the alphabet", () => {
    for (const name of ["株式会社", "***", "   ", "…"]) {
      expect(companySlug(name)).not.toBe("");
    }
  });

  it("produces a slug that is safe in a URL path", () => {
    for (const name of [
      "Acme & Co., Ltd.",
      "Юридична Компанія «Киливник та партнери»",
      "Café Déjà Vu",
    ]) {
      const slug = companySlug(name);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
      expect(slug).not.toContain("--");
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  it("folds accented latin rather than dropping it", () => {
    expect(companySlug("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("is stable, so the same name always addresses the same company", () => {
    expect(companySlug("Acme Coffee")).toBe(companySlug("Acme Coffee"));
  });

  it("caps the slug so it cannot overflow the column it is stored in", () => {
    expect(companySlug("a".repeat(400)).length).toBeLessThanOrEqual(255);
  });
});
