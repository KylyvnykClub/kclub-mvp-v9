"use client";

import type { CountryCode } from "libphonenumber-js";
import {
  AsYouType,
  parsePhoneNumberFromString,
} from "libphonenumber-js/mobile";
import { Check, ChevronsUpDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Locale } from "@/i18n/routing";
import {
  DEFAULT_PHONE_COUNTRY,
  MAX_PHONE_INPUT_LENGTH,
  phoneCountries,
  phoneExample,
  type PhoneCountry,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * The country's flag, from the same `public/flags` set the language switcher in
 * the site header already uses. Not an emoji: Windows ships no flag font, so a
 * regional-indicator pair renders there as the two letters ("us"), which in a
 * picker reads as a typo. Not a third-party flag CDN either — every member
 * opening the sign-in page would announce themselves to it.
 */
function Flag({ code }: { code: CountryCode }) {
  return (
    // A 300-byte flag needs no optimiser, and next/image would put a loader in
    // front of 240 of them for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${code.toLowerCase()}.png`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={20}
      height={14}
      className="h-[14px] w-[20px] shrink-0 object-cover"
    />
  );
}

interface PhoneState {
  country: CountryCode;
  /** Exactly what the member sees in the box. */
  text: string;
}

/**
 * The box holds the *national* number, because the trigger beside it already
 * shows the dialling code. Letting both hold it made the field read
 * "+380 | +380 50 123 4567" and left it genuinely ambiguous whether the prefix
 * was being applied or merely displayed.
 *
 * A number typed or pasted in international form is therefore not kept as
 * typed: it names its own country, so the picker moves to it and the box is
 * left with the national part alone. Until enough digits have arrived to
 * identify a country, a leading `+` stays as typed — the member is mid-number,
 * and truncating it would fight them.
 */
function readInto(country: CountryCode, text: string): PhoneState {
  const trimmed = text.trim();

  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    // Only once the number could actually be one. A country is recognisable
    // from far fewer digits than that - "+38050" already says Ukraine - but
    // `formatNational()` on a part-typed number drops the trunk prefix, so
    // converting that early leaves "501234567" where the member expects
    // "050 123 4567".
    if (parsed?.country && parsed.isPossible()) {
      return { country: parsed.country, text: parsed.formatNational() };
    }
    // Still incomplete: keep the text as typed, and leave the picker where it
    // is. Moving it now would put the dialling code in both the trigger and
    // the box, which is the confusion this field is shedding.
    return { country, text: new AsYouType().input(trimmed) };
  }

  return { country, text: new AsYouType(country).input(trimmed) };
}

function CountryPicker({
  value,
  countries,
  onSelect,
  label,
  searchPlaceholder,
  emptyLabel,
  container,
}: {
  value: CountryCode;
  countries: PhoneCountry[];
  onSelect: (country: CountryCode) => void;
  label: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Keeps the panel inside the field's own themed region. */
  container: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const selected = countries.find((country) => country.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        className="flex shrink-0 items-center gap-1.5 rounded-none border border-r-0 border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Flag code={value} />
        <span className="tabular-nums">+{selected?.callingCode ?? ""}</span>
        <ChevronsUpDown
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        container={container}
        className="w-[19rem] rounded-none p-0"
      >
        <Command
          // Match on the country's own name and on its dialling code, so both
          // "Україна" and "380" find Ukraine. cmdk lowercases the haystack.
          filter={(itemValue, search) =>
            itemValue.includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.code} ${country.callingCode}`.toLowerCase()}
                  onSelect={() => {
                    onSelect(country.code);
                    setOpen(false);
                  }}
                >
                  <Flag code={country.code} />
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    +{country.callingCode}
                  </span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      country.code === value ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The one phone field in the product (ADR 0027): a searchable country picker
 * and a box that formats as you type, submitting E.164 whatever the member
 * typed.
 *
 * Every screen that takes a phone number uses this, so the number reaching the
 * server has the same shape from all of them. Before it, each form asked for a
 * bare string and the phone-change screen had to explain the format in prose.
 *
 * The visible box holds the national number only — the picker beside it
 * carries the dialling code — and is not the submitted field: a hidden input
 * carries the E.164 the server stores. The
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
  defaultValue?: string;
  defaultCountry?: CountryCode;
}) {
  const t = useTranslations("auth");
  const locale = useLocale() as Locale;
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<PhoneState>(() =>
    readInto(defaultCountry, defaultValue),
  );

  // The list is built after mount. Country names come from
  // `Intl.DisplayNames`, whose ICU data differs between Node and the browser
  // for HK, MO, PS and FK; rendering them on both sides fails hydration (React
  // #418) and takes the whole form's interactivity with it. Until then the
  // trigger shows a flag and a dialling code, both derived from the country
  // code and identical everywhere.
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

  function handleCountry(country: CountryCode): void {
    setState((current) => ({
      country,
      text: new AsYouType(country).input(current.text),
    }));
  }

  return (
    <div className="flex" ref={setRow}>
      <CountryPicker
        container={row}
        value={state.country}
        countries={countries}
        onSelect={handleCountry}
        label={t("phoneCountryLabel")}
        searchPlaceholder={t("phoneCountrySearch")}
        emptyLabel={t("phoneCountryEmpty")}
      />
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

/**
 * The phone field as every screen actually wants it: its label and the control,
 * spaced the way the rest of the forms are.
 *
 * Unlike `PasswordInput`, which deliberately leaves the label to its caller
 * because the sign-in form pairs it with a "forgot password" control on the
 * same row, all four phone fields are a plain label above a plain control. The
 * only thing that differed was the label's wording, which is the prop.
 */
export function PhoneField({
  label,
  className,
  ...props
}: React.ComponentProps<typeof PhoneInput> & {
  /** The field's own label. Wording differs per screen; the picker's does not. */
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{label}</Label>
      <PhoneInput className={className} {...props} />
    </div>
  );
}
