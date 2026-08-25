import { env } from "@/env";
import { locales, routing } from "@/i18n/routing";

/**
 * SEO URL helpers.
 *
 * The app serves three locales under an always-on prefix (`/en`, `/ru`, `/uk`,
 * see i18n/routing.ts). Search engines therefore see three near-duplicate URLs
 * for every page and need an explicit hreflang cluster plus a canonical to
 * consolidate them - none of which Next.js emits on its own. These helpers
 * produce absolute URLs (relative ones never resolve for canonical/OG) from the
 * single configured origin.
 */

const BASE = env.server.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

/** Absolute URL for a root-relative path, e.g. `/en/directory`. */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${p}`;
}

/**
 * Canonical + hreflang alternates for a locale-prefixed page.
 *
 * `path` is everything AFTER the locale segment: `""` for the home page,
 * `"/directory"`, `"/directory/acme-corp"`. The canonical points at the
 * current locale; `languages` links every locale sibling and an `x-default`
 * pointing at the default locale, so Google shows the right language and does
 * not treat the siblings as duplicate content.
 */
export function localeAlternates(
  locale: string,
  path = "",
): { canonical: string; languages: Record<string, string> } {
  const suffix = path && !path.startsWith("/") ? `/${path}` : path;
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = absoluteUrl(`/${l}${suffix}`);
  }
  languages["x-default"] = absoluteUrl(`/${routing.defaultLocale}${suffix}`);
  return { canonical: absoluteUrl(`/${locale}${suffix}`), languages };
}
