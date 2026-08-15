import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  locales,
  type Locale,
} from "@/i18n/routing";

/**
 * Writing the member's saved language into the cookie next-intl reads (FR-091).
 *
 * The middleware's order is: the locale in the URL, then this cookie, then the
 * browser's `Accept-Language`, then the default. Writing the preference here is
 * what puts it first, without a database read on every request - the
 * alternative would be to look the member up in middleware, on a path that runs
 * for every asset.
 */

export { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME };

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  );
}

/**
 * The cookie to write, or null when the value is not a locale we publish. A
 * stored language that is no longer supported is dropped rather than written
 * back.
 */
export function localeCookieOptions(language: unknown): {
  name: string;
  value: Locale;
  maxAge: number;
  sameSite: "lax";
  path: string;
} | null {
  if (!isSupportedLocale(language)) return null;

  return {
    name: LOCALE_COOKIE_NAME,
    value: language,
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  };
}
