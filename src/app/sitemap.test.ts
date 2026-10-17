import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.KCLUB_SKIP_DB_PRERENDER = "1";
});

vi.mock("@/env", () => ({
  env: { server: { NEXT_PUBLIC_APP_URL: "https://www.kylyvnyk.club" } },
}));
vi.mock("@/data/db", () => ({ db: {} }));
vi.mock("@/data/companies", () => ({}));
vi.mock("@/actions/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));

import sitemap from "./sitemap";
import { localeAlternates } from "@/lib/seo";

describe("SEO: sitemap.xml", () => {
  it("lists every public page in each locale", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const locale of ["en", "ru", "uk"]) {
      expect(urls).toContain(`https://www.kylyvnyk.club/${locale}`);
      expect(urls).toContain(`https://www.kylyvnyk.club/${locale}/directory`);
      expect(urls).toContain(`https://www.kylyvnyk.club/${locale}/pricing`);
      expect(urls).toContain(`https://www.kylyvnyk.club/${locale}/legal`);
    }
  });

  it("carries no xhtml:link alternates, so browsers show it as an XML tree", async () => {
    const entries = await sitemap();
    expect(entries.every((entry) => entry.alternates === undefined)).toBe(true);
  });
});

describe("SEO: locale alternates", () => {
  it("puts the locale before the path", () => {
    expect(localeAlternates("uk", "/pricing")).toEqual({
      canonical: "https://www.kylyvnyk.club/uk/pricing",
      languages: {
        en: "https://www.kylyvnyk.club/en/pricing",
        ru: "https://www.kylyvnyk.club/ru/pricing",
        uk: "https://www.kylyvnyk.club/uk/pricing",
        "x-default": "https://www.kylyvnyk.club/en/pricing",
      },
    });
  });
});
