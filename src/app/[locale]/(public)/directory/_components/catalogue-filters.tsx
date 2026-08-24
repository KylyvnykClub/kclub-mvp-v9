"use client";

import {
  ChevronDown,
  ChevronRight,
  Dot,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { CategoryTreeRow } from "@/data/companies";
import { countryOptions } from "@/lib/countries";
import type { Locale } from "@/i18n/routing";

/** A country/city pair that at least one visible partner actually has. */
export interface PartnerLocationOption {
  country: string;
  city: string | null;
}

export interface CatalogueFilterValues {
  q: string;
  block: string;
  category: string;
  categoryId: string;
  country: string;
  city: string;
  mode: "" | "online" | "offline";
  administrativeLevel1: string;
  administrativeLevel2: string;
}

const EMPTY: CatalogueFilterValues = {
  q: "",
  block: "",
  category: "",
  categoryId: "",
  country: "",
  city: "",
  mode: "",
  administrativeLevel1: "",
  administrativeLevel2: "",
};

type CatalogueControlsProps = {
  categories: CategoryTreeRow[];
  locations: PartnerLocationOption[];
  values: CatalogueFilterValues;
  view: "grid" | "list";
};

type ActiveChip = {
  key: string;
  label: string;
  clear: CatalogueFilterValues;
};

const labelClass =
  "text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60";

function useCatalogueFilters({
  categories,
  locations,
  values,
  view,
}: CatalogueControlsProps) {
  const router = useRouter();

  const selectedSubcategory = useMemo(
    () => categories.find((c) => String(c.id) === values.categoryId),
    [categories, values.categoryId],
  );
  const resolvedBlock = values.block || selectedSubcategory?.block || "";
  const resolvedCategory =
    values.category || selectedSubcategory?.category || "";

  const blocks = useMemo(
    () => [...new Set(categories.map((c) => c.block))].sort(),
    [categories],
  );

  const categoriesInBlock = useMemo(() => {
    if (!resolvedBlock) return [];
    return [
      ...new Set(
        categories
          .filter((c) => c.block === resolvedBlock)
          .map((c) => c.category),
      ),
    ].sort();
  }, [categories, resolvedBlock]);

  const citiesInCountry = useMemo(() => {
    if (!values.country) return [];
    return [
      ...new Set(
        locations
          .filter((l) => l.country === values.country && l.city)
          .map((l) => l.city as string),
      ),
    ].sort();
  }, [locations, values.country]);

  const apply = (next: CatalogueFilterValues) => {
    const query = new URLSearchParams();
    if (next.q) query.set("q", next.q);
    if (next.block) query.set("block", next.block);
    if (next.category) query.set("category", next.category);
    if (next.categoryId) query.set("categoryId", next.categoryId);
    if (next.country) query.set("country", next.country);
    if (next.city) query.set("city", next.city);
    if (view === "list") query.set("view", "list");

    const qs = query.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  const activeChips = [
    values.q && {
      key: "q",
      label: `"${values.q}"`,
      clear: { ...values, q: "" },
    },
    resolvedBlock && {
      key: "block",
      label: resolvedBlock,
      clear: { ...values, block: "", category: "", categoryId: "" },
    },
    resolvedCategory && {
      key: "category",
      label: resolvedCategory,
      clear: { ...values, category: "", categoryId: "" },
    },
    values.categoryId && {
      key: "categoryId",
      label: selectedSubcategory?.subcategory ?? values.categoryId,
      clear: { ...values, categoryId: "" },
    },
    values.country && {
      key: "country",
      label: values.country,
      clear: { ...values, country: "", city: "" },
    },
    values.city && {
      key: "city",
      label: values.city,
      clear: { ...values, city: "" },
    },
  ].filter(Boolean) as ActiveChip[];

  return {
    activeChips,
    apply,
    blocks,
    categoriesInBlock,
    citiesInCountry,
    resolvedBlock,
    resolvedCategory,
  };
}

export function CatalogueHeaderControls({
  categories,
  countryCount,
  locations,
  shownCount,
  totalCount,
  values,
  view,
}: CatalogueControlsProps & {
  totalCount: number;
  shownCount: number;
  countryCount: number;
}) {
  const t = useTranslations("catalogue");
  const [query, setQuery] = useState(values.q);
  const { activeChips, apply } = useCatalogueFilters({
    categories,
    locations,
    values,
    view,
  });

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-5 sm:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className={labelClass}>{t("eyebrow")}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold leading-none tracking-normal text-foreground">
            {t("title")}
          </h1>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply({ ...values, q: query.trim() });
          }}
          className="flex min-h-11 w-full max-w-[460px] items-center gap-3 rounded-md border border-border bg-card px-4 transition-colors focus-within:border-accent"
        >
          <Search
            className="size-4 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </form>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/70 pt-4">
        {[
          [totalCount, t("totalLabel"), "text-accent-ink"],
          [shownCount, t("shownLabel"), "text-foreground"],
          [countryCount, t("countriesLabel"), "text-foreground"],
        ].map(([value, label, color]) => (
          <div
            key={label}
            className="flex items-baseline gap-2 border-r border-border pr-6 last:border-r-0"
          >
            <span className={`font-mono text-lg ${color}`}>{value}</span>
            <span className={labelClass}>{label}</span>
          </div>
        ))}

        <div className="min-w-8 flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          <span className={labelClass}>{t("selectedLabel")}:</span>
          {activeChips.length > 0 ? (
            activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => apply(chip.clear)}
                aria-label={t("removeFilter", { filter: chip.label })}
                className="inline-flex min-h-7 cursor-pointer items-center gap-2 rounded border border-border-strong bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {chip.label}
                <X className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("allCatalogue")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CatalogueFilters(props: CatalogueControlsProps) {
  const t = useTranslations("catalogue");
  const locale = useLocale() as Locale;
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const {
    apply,
    blocks,
    categoriesInBlock,
    citiesInCountry,
    resolvedBlock,
    resolvedCategory,
  } = useCatalogueFilters(props);
  const { categories, values } = props;

  const buttonClass = (active: boolean, level: 0 | 1 | 2) =>
    [
      "flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border pr-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      level === 0 ? "pl-3" : level === 1 ? "pl-6" : "pl-9",
      active
        ? "border-accent bg-secondary text-foreground"
        : level === 0
          ? "border-border/70 text-muted-foreground hover:border-border-strong hover:text-foreground"
          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
    ].join(" ");

  return (
    <aside className="min-w-0 space-y-7 lg:sticky lg:top-48">
      <div className="space-y-3">
        <p className={labelClass}>{t("taxonomyLabel")}</p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() =>
              apply({ ...values, block: "", category: "", categoryId: "" })
            }
            className={buttonClass(
              !resolvedBlock && !resolvedCategory && !values.categoryId,
              0,
            )}
          >
            <Dot className="size-4 text-accent-ink" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {t("allCategories")}
            </span>
          </button>

          {blocks.map((block) => {
            const open = resolvedBlock === block;
            return (
              <div key={block} className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    apply(
                      open
                        ? { ...values, block: "", category: "", categoryId: "" }
                        : {
                            ...values,
                            block,
                            category: "",
                            categoryId: "",
                          },
                    )
                  }
                  className={buttonClass(open, 0)}
                >
                  {open ? (
                    <ChevronDown className="size-4 text-accent-ink" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground/60" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{block}</span>
                </button>

                {open &&
                  categoriesInBlock.map((category) => {
                    const categoryOpen = resolvedCategory === category;
                    return (
                      <div key={category} className="space-y-1">
                        <button
                          type="button"
                          onClick={() =>
                            apply(
                              categoryOpen
                                ? { ...values, category: "", categoryId: "" }
                                : { ...values, category, categoryId: "" },
                            )
                          }
                          className={buttonClass(categoryOpen, 1)}
                        >
                          {categoryOpen ? (
                            <span className="w-4 text-center text-accent-ink">
                              -
                            </span>
                          ) : (
                            <span className="w-4 text-center text-muted-foreground/60">
                              +
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {category}
                          </span>
                        </button>

                        {categoryOpen &&
                          categories
                            .filter(
                              (row) =>
                                row.block === resolvedBlock &&
                                row.category === category,
                            )
                            .sort((a, b) =>
                              a.subcategory.localeCompare(b.subcategory),
                            )
                            .map((row) => {
                              const active =
                                values.categoryId === String(row.id);
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  onClick={() =>
                                    apply({
                                      ...values,
                                      block: row.block,
                                      category: row.category,
                                      categoryId: active ? "" : String(row.id),
                                    })
                                  }
                                  className={buttonClass(active, 2)}
                                >
                                  <Dot
                                    className="size-4 text-muted-foreground/60"
                                    aria-hidden
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {row.subcategory}
                                  </span>
                                </button>
                              );
                            })}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <label className={labelClass} htmlFor="filter-country">
          {t("countryPlaceholder")}
        </label>
        <select
          id="filter-country"
          value={values.country}
          onChange={(event) =>
            apply({ ...values, country: event.target.value, city: "" })
          }
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="">{t("allCountries")}</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <p className={labelClass}>{t("businessModeLabel")}</p>
        <div className="flex gap-2">
          {(["online", "offline"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                apply({ ...values, mode: values.mode === mode ? "" : mode })
              }
              className={`min-h-9 rounded-md border px-3 text-xs ${values.mode === mode ? "border-accent bg-secondary text-foreground" : "border-border text-muted-foreground"}`}
            >
              {t(mode === "online" ? "onlineMode" : "offlineMode")}
            </button>
          ))}
        </div>
      </div>

      {values.mode === "offline" && (
        <div className="space-y-3">
          <label className={labelClass} htmlFor="filter-level-1">
            {t("administrativeLevel1Label")}
          </label>
          <input
            id="filter-level-1"
            value={values.administrativeLevel1}
            onChange={(event) =>
              apply({ ...values, administrativeLevel1: event.target.value })
            }
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          />
          <label className={labelClass} htmlFor="filter-level-2">
            {t("administrativeLevel2Label")}
          </label>
          <input
            id="filter-level-2"
            value={values.administrativeLevel2}
            onChange={(event) =>
              apply({ ...values, administrativeLevel2: event.target.value })
            }
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
      )}

      {values.country && citiesInCountry.length > 0 && (
        <div className="space-y-3">
          <label htmlFor="filter-city" className={labelClass}>
            {t("cityPlaceholder")}
          </label>
          <select
            id="filter-city"
            value={values.city}
            onChange={(event) => apply({ ...values, city: event.target.value })}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="">{t("allCities")}</option>
            {citiesInCountry.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        onClick={() => apply(EMPTY)}
        className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-medium tracking-[0.04em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {t("clearFilters")}
      </button>
    </aside>
  );
}
