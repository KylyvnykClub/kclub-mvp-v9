"use client";

import { Grid2x2, Globe, LayoutList, MapPin, Search, Tags } from "lucide-react";
import { useLocale } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { useRouter } from "@/i18n/navigation";
import { countryName } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";
import type { CategoryTreeRow, PartnerLocation } from "@/data/companies";

/**
 * The catalogue's filters, on the landing page.
 *
 * It builds a `/directory?…` URL and navigates; it never queries anything
 * itself. That is deliberate - the catalogue page already parses, validates and
 * authorises these parameters, so a second search path would be a second place
 * to get that wrong.
 *
 * The three category selects narrow each other because the taxonomy is a tree:
 * picking a block that does not contain the chosen category would otherwise
 * produce a URL that matches nothing.
 */
export function PartnerSearchSection({
  categories,
  locations,
  labels,
}: {
  categories: CategoryTreeRow[];
  locations: PartnerLocation[];
  labels: {
    title: string;
    placeholder: string;
    submit: string;
    country: string;
    city: string;
    block: string;
    category: string;
    subcategory: string;
    anyCountry: string;
    anyCity: string;
    anyBlock: string;
    anyCategory: string;
    anySubcategory: string;
    subcategoryHint: string;
  };
}) {
  const router = useRouter();
  const locale = useLocale() as Locale;

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [block, setBlock] = useState("");
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState("");

  /**
   * `companies.country` is an ISO 3166-1 alpha-2 code, and the select used to
   * render it raw: a member choosing the United States saw "US", which reads
   * as a truncated "USA" and, next to "UA", as a typo rather than a country.
   * The option carries the localized name and still submits the code, so the
   * `/directory?country=` contract is unchanged.
   */
  const countries = useMemo(
    () =>
      [...new Set(locations.map((l) => l.country))]
        .map((code) => ({ code, name: countryName(code, locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locations, locale],
  );

  const cities = useMemo(
    () =>
      [
        ...new Set(
          locations
            .filter((l) => (country ? l.country === country : true))
            .map((l) => l.city)
            .filter((c): c is string => Boolean(c)),
        ),
      ].sort(),
    [locations, country],
  );

  const blocks = useMemo(
    () => [...new Set(categories.map((c) => c.block))].sort(),
    [categories],
  );

  const categoryNames = useMemo(
    () =>
      [
        ...new Set(
          categories
            .filter((c) => (block ? c.block === block : true))
            .map((c) => c.category),
        ),
      ].sort(),
    [categories, block],
  );

  const subcategories = useMemo(
    () =>
      categories
        .filter((c) => (block ? c.block === block : true))
        .filter((c) => (category ? c.category === category : true))
        .sort((a, b) => a.subcategory.localeCompare(b.subcategory)),
    [categories, block, category],
  );

  function submit() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (block) params.set("block", block);
    if (category) params.set("category", category);
    if (categoryId) params.set("categoryId", categoryId);

    const qs = params.toString();
    router.push(qs ? `/directory?${qs}` : "/directory");
  }

  return (
    <section className="border-t border-white/10 bg-[#0b0d14] py-12 text-white sm:py-16">
      <div className="kclub-shell">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="flex items-center gap-3 text-xl font-black uppercase tracking-[0.08em] text-[#e8c66a] sm:text-2xl">
              <Search className="size-7 shrink-0" aria-hidden />
              {labels.title}
            </h2>

            <div className="flex w-full gap-3 lg:max-w-2xl">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={labels.placeholder}
                  aria-label={labels.placeholder}
                  className="h-12 w-full rounded-lg border border-white/15 bg-black/40 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus-visible:border-[#d4af37] focus-visible:outline-none"
                />
              </div>

              <button
                type="submit"
                className="h-12 shrink-0 rounded-lg bg-[#d4af37] px-7 text-sm font-bold text-black transition-colors hover:bg-[#e8c66a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
              >
                {labels.submit}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Filter icon={<Globe className="size-4" />} label={labels.country}>
              <select
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setCity("");
                }}
                aria-label={labels.country}
                className={selectClass}
              >
                <option value="">{labels.anyCountry}</option>
                {countries.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Filter>

            <Filter icon={<MapPin className="size-4" />} label={labels.city}>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                aria-label={labels.city}
                className={selectClass}
              >
                <option value="">{labels.anyCity}</option>
                {cities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Filter>

            <Filter icon={<Grid2x2 className="size-4" />} label={labels.block}>
              <select
                value={block}
                onChange={(event) => {
                  setBlock(event.target.value);
                  setCategory("");
                  setCategoryId("");
                }}
                aria-label={labels.block}
                className={selectClass}
              >
                <option value="">{labels.anyBlock}</option>
                {blocks.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Filter>

            <Filter
              icon={<LayoutList className="size-4" />}
              label={labels.category}
            >
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setCategoryId("");
                }}
                aria-label={labels.category}
                className={selectClass}
              >
                <option value="">{labels.anyCategory}</option>
                {categoryNames.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Filter>

            <Filter
              icon={<Tags className="size-4" />}
              label={labels.subcategory}
            >
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                aria-label={labels.subcategory}
                disabled={!category}
                className={`${selectClass} disabled:cursor-not-allowed disabled:text-white/35`}
              >
                <option value="">
                  {category ? labels.anySubcategory : labels.subcategoryHint}
                </option>
                {subcategories.map((row) => (
                  <option key={row.id} value={String(row.id)}>
                    {row.subcategory}
                  </option>
                ))}
              </select>
            </Filter>
          </div>
        </form>
      </div>
    </section>
  );
}

const selectClass =
  "h-10 w-full rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white focus-visible:border-[#d4af37] focus-visible:outline-none";

function Filter({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/12 bg-[#11141c] p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
        <span className="text-[#d4af37]" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      {children}
    </div>
  );
}
