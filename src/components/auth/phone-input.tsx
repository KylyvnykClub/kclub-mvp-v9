"use client";

import type { CountryCode } from "libphonenumber-js";
import { AsYouType } from "libphonenumber-js/mobile";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/routing";
import {
  DEFAULT_PHONE_COUNTRY,
  MAX_PHONE_INPUT_LENGTH,
  asCountryCode,
  phoneCountries,
  phoneCountryBadge,
  phoneExample,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

// No height of its own: the row stretches it to whatever the caller sized the
// number box to, so this works on both the h-12 auth forms and the default-
// height staff form without either having to say so.
const SELECT_CLASS =
  "w-[11rem] shrink-0 rounded-none border border-input border-r-0 bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface PhoneState {
  country: CountryCode;
  /** Exactly what the member sees in the box. */
  text: string;
}

function readInto(country: CountryCode, text: string): PhoneState {
  const formatter = new AsYouType(country);
  const formatted = formatter.input(text);
  // A number typed or pasted in international form names its own country, and
  // the picker follows it rather than contradicting what is in the box.
  return { country: formatter.getCountry() ?? country, text: formatted };
}

/**
 * The one phone field in the product (ADR 0027): a country picker and a box
 * that formats as you type, submitting E.164 whatever the member typed.
 *
 * Every screen that takes a phone number uses this, so the number reaching the
 * server has the same shape from all of them. Before it, each form asked for a
 * bare string and the phone-change screen had to explain the format in prose.
 *
 * It renders no label, like `PasswordInput`: the caller owns that, because the
 * sign-in form pairs its label with another control on the same row.
 *
 * The visible box is not the submitted field. The member sees their own
 * national spelling; a hidden input carries the E.164 the server stores. The
 * box takes what can be dialled and nothing else — letters are dropped as they
 * are typed — and a half-finished number is submitted as the partial E.164 it
 * forms, so the server answers with what is wrong with the number rather than
 * with "required".
 *
 * Grouping is `AsYouType`'s, which means it appears once the digits match a
 * national pattern: `0671234567` shows as `067 123 4567`, while the same number
 * typed without its trunk prefix stays unseparated. Both resolve to the same
 * E.164, and the placeholder shows the form that groups.
 */
export function PhoneInput({
  id,
  name,
  countryLabel,
  defaultValue = "",
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  required,
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  name: string;
  /** Accessible name for the country picker. */
  countryLabel: string;
  defaultValue?: string;
  defaultCountry?: CountryCode;
}) {
  const locale = useLocale() as Locale;
  const [state, setState] = useState<PhoneState>(() =>
    readInto(defaultCountry, defaultValue),
  );

  // The full list is built after mount, and the server renders one option
  // carrying no localised name. Country names come from `Intl.DisplayNames`,
  // whose ICU data differs between Node and the browser for HK, MO, PS and FK
  // — rendering them on both sides fails hydration (React #418) and takes the
  // whole form's interactivity with it. See `phoneCountryBadge`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const countries = useMemo(
    () => (mounted ? phoneCountries(locale) : []),
    [mounted, locale],
  );

  const submitted = useMemo(() => {
    const formatter = new AsYouType(state.country);
    formatter.input(state.text);
    return formatter.getNumberValue() ?? state.text;
  }, [state]);

  function handleText(next: string): void {
    setState((current) => {
      // Reformat only while the number grows. Reformatting a deletion puts the
      // separator the member just removed straight back, and the field becomes
      // impossible to correct.
      if (next.length < current.text.length) {
        return { ...current, text: next };
      }
      return readInto(current.country, next);
    });
  }

  function handleCountry(next: string): void {
    const country = asCountryCode(next);
    if (!country) return;
    setState((current) => ({
      country,
      text: new AsYouType(country).input(current.text),
    }));
  }

  return (
    <div className="flex">
      <select
        aria-label={countryLabel}
        value={state.country}
        onChange={(event) => handleCountry(event.target.value)}
        className={SELECT_CLASS}
      >
        {mounted ? (
          countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} +{country.callingCode} {country.name}
            </option>
          ))
        ) : (
          <option value={state.country}>
            {phoneCountryBadge(state.country)}
          </option>
        )}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={state.text}
        onChange={(event) => handleText(event.target.value)}
        placeholder={phoneExample(state.country)}
        maxLength={MAX_PHONE_INPUT_LENGTH}
        required={required}
        className={cn("rounded-none", className)}
        {...props}
      />
      <input type="hidden" name={name} value={submitted} />
    </div>
  );
}
