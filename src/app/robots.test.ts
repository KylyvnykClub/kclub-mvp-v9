import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  NEXT_PUBLIC_APP_URL: "https://www.kylyvnyk.club",
  ALLOW_PUBLIC_INDEXING: undefined as boolean | undefined,
  VERCEL_ENV: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: { server } }));

import robots from "./robots";
import { publicIndexingAllowed } from "@/lib/seo";

beforeEach(() => {
  server.ALLOW_PUBLIC_INDEXING = undefined;
  server.VERCEL_ENV = undefined;
});

describe("SEO: the public site is indexable on production and nowhere else", () => {
  it("opens production by default - no variable to forget at launch", () => {
    expect(
      publicIndexingAllowed({ override: undefined, vercelEnv: "production" }),
    ).toBe(true);
  });

  it.each(["preview", "development", undefined])(
    "keeps a %s deployment out of search by default",
    (vercelEnv) => {
      expect(publicIndexingAllowed({ override: undefined, vercelEnv })).toBe(
        false,
      );
    },
  );

  it("lets the variable override the default either way", () => {
    expect(
      publicIndexingAllowed({ override: false, vercelEnv: "production" }),
    ).toBe(false);
    expect(
      publicIndexingAllowed({ override: true, vercelEnv: "preview" }),
    ).toBe(true);
  });
});

describe("FR-024, FR-089: robots.txt", () => {
  it("on production, allows the site, names the sitemap and keeps private paths out", () => {
    server.VERCEL_ENV = "production";
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;

    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(
      expect.arrayContaining([
        "/*/dashboard/",
        "/*/card/",
        "/*/join/",
        "/*/r/",
        "/*/membership",
        "/api/",
      ]),
    );
    expect(rules.disallow).not.toContain("/*/directory");
    expect(result.sitemap).toBe("https://www.kylyvnyk.club/sitemap.xml");
  });

  it("closes a preview deployment entirely and advertises no sitemap", () => {
    server.VERCEL_ENV = "preview";
    const result = robots();

    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });
});
