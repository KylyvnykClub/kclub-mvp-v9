import { defineRouting } from "next-intl/routing";

export const locales = ["en", "ru", "uk"] as const;
export type Locale = (typeof locales)[number];

/**
 * The cookie the middleware reads before falling back to `Accept-Language`
 * (FR-091). Stated here rather than left to next-intl's default, because
 * `src/lib/locale-cookie.ts` writes it from the member's saved preference and
 * the two have to agree - a silent change of default would stop the preference
 * working without failing anything.
 */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

/** A year: a stated preference is not a session choice. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  },
});
