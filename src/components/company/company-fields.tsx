"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";

import { getLocalizedCategoryTreeAction } from "@/actions/company";
import { listCitiesForCountryAction } from "@/actions/cities";
import { Checkbox } from "@/components/ui/checkbox";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryOptions } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";
import type { CategoryTreeRow } from "@/data/companies";

/**
 * Every question an application asks about the business itself (FR-040,
 * FR-109), on one page and in one order.
 *
 * Shared rather than duplicated: the same fields are asked of a member who
 * already belongs to the club (`/dashboard/company/new`) and of a business
 * arriving from the landing page with no account at all (`/partner`). Two
 * copies of eighteen fields would drift within a week, and the second copy
 * would be the one that forgets a validation.
 *
 * The order is deliberate and was asked for: what the business *is* — block,
 * category, the activities under it — comes before what it says about itself.
 * An applicant who picks their category first writes a description that fits
 * it; one who writes the description first tends to pick whichever category is
 * nearest afterwards, and the catalogue is only as good as that choice.
 *
 * Media is not here. It belongs to the owner, and the two forms stage it
 * differently — a member has a draft to stage into (ADR 0024), a guest has no
 * account yet and uploads after the account exists — so each form renders its
 * own.
 */

export const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const FILE_INPUT_CLASS =
  "block w-full max-w-xs text-sm text-muted-foreground file:mr-3 file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-bold file:uppercase file:tracking-[0.1em]";

/** Every value the form collects, held as strings until the server parses them. */
export type CompanyFormValues = Record<string, string>;

export type SetCompanyFormValues = React.Dispatch<
  React.SetStateAction<CompanyFormValues>
>;

/** The fields these sections own, in the order they are asked. */
export const COMPANY_FIELD_ORDER = [
  "block",
  "category",
  "businessCategoryIds",
  "name",
  "legalName",
  "taxId",
  "website",
  "description",
  "specializationDescription",
  "discount",
  "contactEmail",
  "contactPhone",
  "businessFormat",
  "registrationCountryCode",
  "city",
  "serviceCountryCodes",
  "servesWorldwide",
] as const;

export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-xl border-b border-border/50 pb-2">
      {children}
    </h2>
  );
}

export function CompanyFields({
  values,
  setValues,
}: {
  values: CompanyFormValues;
  setValues: SetCompanyFormValues;
}) {
  const t = useTranslations("company");
  const locale = useLocale() as Locale;

  const [taxonomy, setTaxonomy] = useState<CategoryTreeRow[]>([]);

  useEffect(() => {
    void getLocalizedCategoryTreeAction(locale).then(setTaxonomy);
  }, [locale]);

  const selectedBlock = values.block ?? "";
  const selectedCategory = values.category ?? "";
  const selectedCategoryIds = (values.businessCategoryIds ?? "")
    .split(",")
    .filter(Boolean);

  const countries = useMemo(() => countryOptions(locale), [locale]);
  const blocks = useMemo(
    () => [...new Set(taxonomy.map((row) => row.block))],
    [taxonomy],
  );
  const categories = useMemo(
    () => [
      ...new Set(
        taxonomy
          .filter((row) => row.block === selectedBlock)
          .map((row) => row.category),
      ),
    ],
    [taxonomy, selectedBlock],
  );
  const subcategories = useMemo(
    () =>
      !selectedBlock || !selectedCategory
        ? []
        : taxonomy
            .filter(
              (row) =>
                row.block === selectedBlock &&
                row.category === selectedCategory,
            )
            .map((row) => ({ id: row.id, subcategory: row.subcategory })),
    [taxonomy, selectedBlock, selectedCategory],
  );

  const set = (field: string, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="space-y-8">
      {/* 1. What the business is. Asked first, on purpose - see the note above. */}
      <section className="space-y-4">
        <SectionHeading>{t("categorySection")}</SectionHeading>
        <p className="text-sm text-muted-foreground">{t("categoryNote")}</p>

        <Field id="block" label={t("blockLabel")}>
          <select
            id="block"
            className={SELECT_CLASS}
            value={selectedBlock}
            onChange={(e) =>
              setValues((current) => ({
                ...current,
                block: e.target.value,
                category: "",
                businessCategoryIds: "",
              }))
            }
            required
          >
            <option value="">{t("blockPlaceholder")}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>

        <Field id="category" label={t("categoryLabel")}>
          <select
            id="category"
            className={SELECT_CLASS}
            value={selectedCategory}
            disabled={!selectedBlock}
            onChange={(e) =>
              setValues((current) => ({
                ...current,
                category: e.target.value,
                businessCategoryIds: "",
              }))
            }
            required
          >
            <option value="">{t("categoryPlaceholder")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field id="businessCategoryIds" label={t("subcategoryLabel")}>
          <div
            id="businessCategoryIds"
            role="group"
            aria-label={t("subcategoryLabel")}
            className={`grid gap-x-4 gap-y-2 border border-input bg-background p-3 max-h-64 overflow-y-auto ${
              subcategories.length > 6 ? "sm:grid-cols-2" : ""
            } ${!selectedCategory ? "opacity-50" : ""}`}
          >
            {subcategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("subcategoryPlaceholder")}
              </p>
            ) : (
              subcategories.map((sc) => {
                const value = String(sc.id);
                const checked = selectedCategoryIds.includes(value);
                const disabled =
                  !selectedCategory ||
                  (!checked && selectedCategoryIds.length >= 7);

                return (
                  <label
                    key={sc.id}
                    className="flex items-center gap-2 text-sm leading-tight"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(next) => {
                        const nextSelected = next
                          ? [...selectedCategoryIds, value]
                          : selectedCategoryIds.filter((id) => id !== value);
                        set("businessCategoryIds", nextSelected.join(","));
                      }}
                    />
                    {sc.subcategory}
                  </label>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("subcategoryHint", {
              count: selectedCategoryIds.length,
              max: 7,
            })}
          </p>
        </Field>
      </section>

      {/* 2. What the business says about itself. */}
      <section className="space-y-4">
        <SectionHeading>{t("detailsSection")}</SectionHeading>

        <Field id="name" label={t("nameLabel")}>
          <Input
            id="name"
            value={values.name ?? ""}
            placeholder={t("namePlaceholder")}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>

        <Field id="legalName" label={t("legalNameLabel")}>
          <Input
            id="legalName"
            value={values.legalName ?? ""}
            placeholder={t("legalNamePlaceholder")}
            onChange={(e) => set("legalName", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field id="taxId" label={t("taxIdLabel")}>
            <Input
              id="taxId"
              value={values.taxId ?? ""}
              placeholder="12345678"
              onChange={(e) => set("taxId", e.target.value)}
            />
          </Field>
          <Field id="website" label={t("websiteLabel")}>
            <Input
              id="website"
              value={values.website ?? ""}
              placeholder="https://acme.com"
              onChange={(e) => set("website", e.target.value)}
            />
          </Field>
        </div>

        <Field id="description" label={t("descriptionLabel")}>
          <Textarea
            id="description"
            value={values.description ?? ""}
            placeholder={t("descriptionPlaceholder")}
            rows={4}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field id="specializationDescription" label={t("specializationLabel")}>
          <Textarea
            id="specializationDescription"
            value={values.specializationDescription ?? ""}
            placeholder={t("specializationPlaceholder")}
            rows={4}
            maxLength={500}
            onChange={(e) => set("specializationDescription", e.target.value)}
            required
          />
        </Field>
      </section>

      {/* 3. The offer that makes them a partner, and how a member reaches them. */}
      <section className="space-y-4">
        <SectionHeading>{t("partnerSection")}</SectionHeading>
        <p className="text-sm text-muted-foreground">{t("partnerNote")}</p>

        <Field id="discount" label={t("discountLabel")}>
          <Input
            id="discount"
            value={values.discount ?? ""}
            placeholder={t("discountPlaceholder")}
            onChange={(e) => set("discount", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field id="contactEmail" label={t("contactEmailLabel")}>
            <Input
              id="contactEmail"
              type="email"
              value={values.contactEmail ?? ""}
              placeholder="partners@acme.com"
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </Field>
          <Field id="contactPhone" label={t("contactPhoneLabel")}>
            <Input
              id="contactPhone"
              value={values.contactPhone ?? ""}
              placeholder="+380991234567"
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* 4. Where it operates. */}
      <section className="space-y-4">
        <SectionHeading>{t("locationSection")}</SectionHeading>

        <Field id="businessFormat" label={t("businessFormatLabel")}>
          <select
            id="businessFormat"
            className={SELECT_CLASS}
            value={values.businessFormat ?? ""}
            onChange={(e) => set("businessFormat", e.target.value)}
            required
          >
            <option value="">{t("businessFormatPlaceholder")}</option>
            <option value="offline_only">{t("businessFormatOffline")}</option>
            <option value="online_only">{t("businessFormatOnline")}</option>
            <option value="online_offline">{t("businessFormatHybrid")}</option>
            <option value="on_site_service">{t("businessFormatOnSite")}</option>
          </select>
        </Field>

        <Field
          id="registrationCountryCode"
          label={t("registrationCountryLabel")}
        >
          <CountrySelect
            id="registrationCountryCode"
            value={values.registrationCountryCode ?? ""}
            onChange={(code) =>
              setValues((current) => ({
                ...current,
                registrationCountryCode: code,
                // A city belongs to a country; changing one empties the other.
                city: "",
              }))
            }
            placeholder={t("registrationCountryPlaceholder")}
          />
        </Field>

        {values.businessFormat !== "online_only" && (
          <CityPicker
            countryCode={values.registrationCountryCode ?? ""}
            value={values.city ?? ""}
            onChange={(city) => set("city", city)}
          />
        )}

        <ServiceCountriesPicker
          countries={countries}
          registrationCountryCode={values.registrationCountryCode ?? ""}
          codes={(values.serviceCountryCodes ?? "").split(",").filter(Boolean)}
          worldwide={values.servesWorldwide === "true"}
          onCodesChange={(codes) => set("serviceCountryCodes", codes.join(","))}
          onWorldwideChange={(next) =>
            set("servesWorldwide", next ? "true" : "false")
          }
        />
      </section>
    </div>
  );
}

/**
 * Country of registration → city, picked from the provider's list for that
 * country (ADR 0025). With no lookup available the field is plain text - the
 * server validates city/country agreement either way (FR-041).
 */
function CityPicker({
  countryCode,
  value,
  onChange,
}: {
  countryCode: string;
  value: string;
  onChange: (city: string) => void;
}) {
  const t = useTranslations("company");
  const [cities, setCities] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setCities(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listCitiesForCountryAction(countryCode)
      .then((list) => {
        if (!cancelled) setCities(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  const query = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!cities || query.length === 0) return [];
    return cities
      .filter((city) => city.toLowerCase().includes(query))
      .slice(0, 12);
  }, [cities, query]);
  const exact = cities?.some((c) => c.toLowerCase() === query) ?? false;

  return (
    <Field id="city" label={t("cityLabel")}>
      <div className="relative">
        <Input
          id="city"
          value={value}
          placeholder={t("cityPlaceholder")}
          disabled={!countryCode}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          required
        />
        {open && suggestions.length > 0 && !exact && (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-input bg-background text-sm shadow-md"
          >
            {suggestions.map((city) => (
              <li key={city} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-accent/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(city);
                    setOpen(false);
                  }}
                >
                  {city}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {loading
          ? t("cityLoading")
          : cities === null && countryCode
            ? t("cityFreeText")
            : cities && query && suggestions.length === 0 && !exact
              ? t("noCityMatches")
              : ""}
      </p>
    </Field>
  );
}

/**
 * Service countries as chips added from a type-ahead, unlimited in number.
 * "Worldwide" replaces the list; "same as registration" pins it to one.
 */
function ServiceCountriesPicker({
  countries,
  registrationCountryCode,
  codes,
  worldwide,
  onCodesChange,
  onWorldwideChange,
}: {
  countries: { code: string; name: string }[];
  registrationCountryCode: string;
  codes: string[];
  worldwide: boolean;
  onCodesChange: (codes: string[]) => void;
  onWorldwideChange: (worldwide: boolean) => void;
}) {
  const t = useTranslations("company");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const sameAsRegistration =
    Boolean(registrationCountryCode) &&
    codes.length === 1 &&
    codes[0] === registrationCountryCode;

  const q = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (q.length === 0) return [];
    return countries
      .filter(
        (c) => !codes.includes(c.code) && c.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [countries, codes, q]);

  const nameOf = (code: string) =>
    countries.find((c) => c.code === code)?.name ?? code;
  const locked = worldwide || sameAsRegistration;

  return (
    <Field id="serviceCountryCodes" label={t("serviceCountriesLabel")}>
      <div
        className={`space-y-3 border border-input bg-background p-3 ${locked ? "opacity-60" : ""}`}
      >
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {codes.length === 0 && (
            <li className="text-sm text-muted-foreground">
              {t("serviceCountriesEmpty")}
            </li>
          )}
          {codes.map((code) => (
            <li
              key={code}
              className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-bold uppercase tracking-[0.08em]"
            >
              {nameOf(code)}
              {!locked && (
                <button
                  type="button"
                  aria-label={t("removeCountry", { name: nameOf(code) })}
                  onClick={() => onCodesChange(codes.filter((c) => c !== code))}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="relative">
          <Input
            id="serviceCountryCodes"
            value={query}
            placeholder={t("serviceCountriesSearchPlaceholder")}
            disabled={locked}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-input bg-background text-sm shadow-md"
            >
              {suggestions.map((c) => (
                <li key={c.code} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-accent/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onCodesChange([...codes, c.code]);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={worldwide}
          onChange={(e) => onWorldwideChange(e.target.checked)}
        />
        {t("worldwideLabel")}
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={sameAsRegistration}
          disabled={!registrationCountryCode || worldwide}
          onChange={(e) =>
            onCodesChange(e.target.checked ? [registrationCountryCode] : [])
          }
        />
        {t("serviceSameAsRegistration")}
      </label>
    </Field>
  );
}
