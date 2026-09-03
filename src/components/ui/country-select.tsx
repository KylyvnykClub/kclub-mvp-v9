"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

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
import { countryOptions } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A country's flag, from the `public/flags` set the language switcher in the
 * site header has always used.
 *
 * Not an emoji: Windows ships no flag font, so a regional-indicator pair
 * renders there as two bare letters, which inside a picker reads as a typo.
 * Not a third-party flag CDN either — every member opening the sign-in page
 * would announce themselves to it.
 *
 * `lazy` is right for the hundreds of rows in an open list and wrong for a
 * flag that is always on screen: swapping the `src` of a deferred image can
 * leave the previous country's flag painted next to the new name.
 */
export function Flag({
  code,
  lazy = true,
}: {
  /** ISO 3166-1 alpha-2, in any case. */
  code: string;
  lazy?: boolean;
}) {
  return (
    // A 300-byte flag needs no optimiser, and next/image would put a loader in
    // front of 240 of them for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${code.toLowerCase()}.png`}
      alt=""
      aria-hidden="true"
      loading={lazy ? "lazy" : "eager"}
      width={20}
      height={14}
      className="h-[14px] w-[20px] shrink-0 object-cover"
    />
  );
}

/**
 * The country picker used wherever a country is chosen: registration, the
 * company application, and the dialling-code half of the phone field through
 * its own trigger.
 *
 * Before this, three screens each had their own: registration offered ten
 * hardcoded countries named by a `register.countries.*` translation table, the
 * company form a native `<select>` of all of them, and neither could be
 * searched. Names come from `countryOptions`, so a country reads the same here
 * as everywhere else and in the member's own language.
 *
 * Works controlled (`value` + `onChange`) or on its own; pass `name` and it
 * submits through a hidden input, so a plain server-action form needs nothing
 * else.
 */
export function CountrySelect({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  placeholder,
  className,
  disabled,
}: {
  id?: string;
  /** Submits the selected code under this name. Omit inside a controlled form. */
  name?: string;
  /** Controlled selection. Omit to let the component keep its own. */
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);

  const selected = value ?? own;
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const current = countries.find((country) => country.code === selected);

  function choose(code: string): void {
    if (value === undefined) setOwn(code);
    onChange?.(code);
    setOpen(false);
  }

  return (
    <div ref={setAnchor}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-none border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {current ? (
            <>
              <Flag code={current.code} lazy={false} />
              <span className="flex-1 truncate text-left">{current.name}</span>
            </>
          ) : (
            <span className="flex-1 truncate text-left text-muted-foreground">
              {placeholder}
            </span>
          )}
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          container={anchor}
          className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] rounded-none p-0"
        >
          <Command
            // Substring, not cmdk's default fuzzy scoring, which matches
            // scattered letters: "ukr" otherwise returns South Korea and
            // Burkina Faso alongside Ukraine.
            filter={(itemValue, search) =>
              itemValue.includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder={t("countrySearch")} />
            <CommandList>
              <CommandEmpty>{t("countryNotFound")}</CommandEmpty>
              <CommandGroup>
                {countries.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.code}`.toLowerCase()}
                    onSelect={() => choose(country.code)}
                  >
                    <Flag code={country.code} />
                    <span className="flex-1 truncate">{country.name}</span>
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        country.code === selected ? "opacity-100" : "opacity-0",
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
      {name && <input type="hidden" name={name} value={selected} />}
    </div>
  );
}
