import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Constraint: a `next/link` never points at a bare app path.
 *
 * `localePrefix` is "always" and the middleware only runs on `/` and
 * `/(en|ru|uk)/...`, so `<Link href="/dashboard/...">` from `next/link` is
 * never localised and lands on the root 404. That is how the "reserve the
 * listing fee" link after company registration broke in production. A file
 * that wants a bare path imports `Link` from `@/i18n/navigation`; a file that
 * keeps `next/link` builds the href with the locale in it.
 */

const SRC = join(__dirname, "..", "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [path] : [];
  });
}

const BARE_HREF = /href(?:=\{?|:\s*)["`]\/(?!\$\{)[a-z][^"`]*["`]/g;

describe("constraint: next/link hrefs carry the locale", () => {
  it("finds no bare app path in a file that links with next/link", () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes('from "next/link"')) return [];
      return [...source.matchAll(BARE_HREF)].map(
        (match) => `${file.slice(SRC.length)}: ${match[0]}`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it("would have caught the company registration link", () => {
    expect(
      'href="/dashboard/profile?tab=companies"'.match(BARE_HREF),
    ).not.toBeNull();
    expect("href={`/${locale}/dashboard`}".match(BARE_HREF)).toBeNull();
  });
});
