import { isSupportedLocale } from "@/lib/locale-cookie";
import type { Locale } from "@/i18n/routing";

/**
 * A member's stored language, narrowed to one we actually publish (FR-091).
 *
 * `members.language` is a two-character column, so anything can be in it: a
 * value we stopped publishing, a preference set before a locale was removed, a
 * row written by a seed. Every caller that picks a template or a URL needs the
 * same answer for those, and until now two of them carried their own copy of
 * this line — which is how the third language would have been added to one and
 * not the other.
 */
export function narrowLocale(language: string): Locale {
  return isSupportedLocale(language) ? language : "en";
}
