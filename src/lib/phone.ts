/**
 * The one place that decides what a phone number is (FR-001).
 *
 * A member is identified by their phone number: `members.phone` is unique and
 * `findMemberByPhone` compares it with `=`. Before this module the application
 * held three incompatible opinions about what that string may look like —
 * `z.string().min(8).max(20)` on sign-in, registration and code requests, the
 * same on staff creation, and `/^\+[1-9]\d{6,14}$/` on a phone change. The same
 * person typing `+380 67 123 45 67` on one screen and `+380671234567` on
 * another was therefore two different rows to the database, the unique index
 * did not object, and only one of those numbers could sign in.
 *
 * Normalisation happens on the server, at every trust boundary, and always
 * produces E.164. The client is never believed: `register-flow.tsx` carries the
 * number through its steps in React state and posts it back raw, so the schema
 * has to be idempotent and has to run again on the last step.
 *
 * Metadata is `libphonenumber-js/mobile`, the smallest set that can tell a
 * mobile number from a landline. That distinction is the product's, not a
 * preference: FR-002 delivers the verification code over SMS, so a number that
 * cannot receive one is not an identity this club can issue. It costs ~5 kB
 * gzipped over the `min` set. In the US and Canada the carrier ranges are
 * shared, so `FIXED_LINE_OR_MOBILE` is the most any metadata set can say there
 * and both kinds are accepted.
 */

import type { CountryCode } from "libphonenumber-js";
// The package's own subpath for this, not the raw `.json`: under a bundler
// that resolves the `import` condition it maps to `examples.mobile.json.js`,
// which is an ES module and not JSON, and asking for it as JSON fails the
// Next build.
import examples from "libphonenumber-js/mobile/examples";
import {
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/mobile";
import { z } from "zod";

import { countryFlag, countryOptions } from "./countries";
import type { Locale } from "@/i18n/routing";

/**
 * Assumed when the input carries no `+` and the caller names no country.
 *
 * A number written in international form ignores this entirely — it only
 * decides how to read a national number such as `2015550123`. The phone input
 * sends E.164, so this is the fallback for a form posted without it.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "US";

/**
 * Longest raw input parsed at all. E.164 is at most 16 characters; the slack is
 * for the separators, brackets and spaces a person types. Bounding the string
 * before it reaches the parser keeps a hostile caller from handing the matcher
 * something enormous.
 */
export const MAX_PHONE_INPUT_LENGTH = 32;

/**
 * Narrows a stored two-letter code — `members.country`, a form field — to one
 * the metadata actually knows, so a country nobody dials from degrades to the
 * default rather than to a type assertion.
 */
export function asCountryCode(value: string): CountryCode | undefined {
  const upper = value.trim().toUpperCase();
  return isSupportedCountry(upper) ? upper : undefined;
}

/**
 * The E.164 form of `input`, or null when it cannot be read as a phone number
 * at all. Says nothing about whether the number is valid or reachable — use
 * {@link isValidPhone} for that.
 */
export function toE164(
  input: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  return parsed ? parsed.number : null;
}

/**
 * Whether `input` is a number that can receive an SMS (FR-002). Rejects
 * landlines wherever the country's numbering plan separates them.
 */
export function isValidPhone(
  input: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): boolean {
  const parsed = parsePhoneNumberFromString(input.trim(), country);
  return parsed ? parsed.isValid() : false;
}

/**
 * For a boundary where a member *claims* a number: registration, a phone
 * change, staff creation. Rejects anything that could not receive its
 * verification code, and yields E.164.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PHONE_INPUT_LENGTH)
  .transform((value, ctx) => {
    const parsed = parsePhoneNumberFromString(value, DEFAULT_PHONE_COUNTRY);

    if (!parsed?.isValid()) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a mobile number in international format",
      });
      return z.NEVER;
    }

    return parsed.number;
  });

/**
 * For a boundary that *looks a number up* rather than claiming it: sign-in, and
 * requesting a code for a number that may already be registered.
 *
 * Deliberately not {@link phoneSchema}. Validating here would protect nothing —
 * a number that is not in the table simply is not found — while locking out
 * every row that predates normalisation, the seeded staff owner among them
 * (`ADMIN_BOOTSTRAP_OWNER_PHONE` is `+380000000000`, which is well formed and
 * not a real number). Unparseable input is passed through unchanged so an exact
 * legacy match is still reachable.
 */
export const phoneLookupSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PHONE_INPUT_LENGTH)
  .transform((value) => toE164(value) ?? value);

/**
 * A real number from `country`, in the national form somebody there would
 * write, for use as a placeholder. `+380 XX XXX XX XX` was hard-coded into the
 * three locales and wrong for everyone outside Ukraine.
 */
export function phoneExample(country: CountryCode): string {
  return getExampleNumber(country, examples)?.formatNational() ?? "";
}

/**
 * A country identified without `Intl.DisplayNames` — `🇺🇦 +380`.
 *
 * Node and Chromium ship different ICU data, and for a handful of territories
 * they disagree on the name: Node calls HK "Hong Kong SAR China" where Chromium
 * says "Hong Kong", and likewise for MO, PS and FK. Rendering a localised name
 * during hydration therefore fails it (React #418). A flag and a dialling code
 * are computed from the code itself and are identical everywhere.
 */
export function phoneCountryBadge(country: CountryCode): string {
  return `${countryFlag(country)} +${getCountryCallingCode(country)}`;
}

export interface PhoneCountry {
  code: CountryCode;
  /** Localised country name, from `countryOptions`. */
  name: string;
  /** Regional-indicator flag. */
  flag: string;
  /** Dialling code without the `+`. */
  callingCode: string;
}

/**
 * The countries the picker offers: the product's own list, localised and sorted
 * by {@link countryOptions}, narrowed to those this metadata can actually
 * validate and dial.
 *
 * Built from `countries.ts` rather than from `getCountries()` so the picker
 * names a country exactly as the catalogue filters and the company form already
 * name it, in the member's own language, instead of introducing a second
 * English-only list.
 */
export function phoneCountries(locale: Locale): PhoneCountry[] {
  const supported: PhoneCountry[] = [];

  for (const { code, name } of countryOptions(locale)) {
    const country = asCountryCode(code);
    if (!country) continue;

    supported.push({
      code: country,
      name,
      flag: countryFlag(country),
      callingCode: getCountryCallingCode(country),
    });
  }

  return supported;
}
