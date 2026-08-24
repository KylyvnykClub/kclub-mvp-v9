"use client";

import { ArrowUpRight, Filter, MapPin, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { CategoryTreeRow } from "@/data/companies";

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
}

const EMPTY: CatalogueFilterValues = {
  q: "",
  block: "",
  category: "",
  categoryId: "",
  country: "",
  city: "",
};

const FIELD =
  "group flex min-h-20 flex-col justify-center bg-background px-4 py-3 transition-colors focus-within:bg-muted/50 sm:px-5";
const FIELD_LABEL =
  "mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground";
const CONTROL =
  "h-8 w-full bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60";

/**
 * The catalogue's filter bar.
 *
 * This is a client component for one reason: the selects cascade. Category
 * narrows to the chosen block, subcategory to the chosen category, city to the
 * chosen country, and doing that on the server would cost a round trip per
 * select. The reference data it needs is small enough to hand over whole.
 *
 * The URL stays the source of truth - the results themselves are rendered on
 * the server from these same params - so a filtered catalogue is shareable and
 * the back button behaves.
 */
export function CatalogueFilters({
  categories,
  locations,
  values,
  view,
}: {
  categories: CategoryTreeRow[];
  locations: PartnerLocationOption[];
  values: CatalogueFilterValues;
  view: "grid" | "list";
}) {
  const t = useTranslations("catalogue");
  const router = useRouter();
  const [draft, setDraft] = useState<CatalogueFilterValues>(values);

  const blocks = useMemo(
    () => [...new Set(categories.map((c) => c.block))].sort(),
    [categories],
  );

  const categoriesInBlock = useMemo(() => {
    if (!draft.block) return [];
    return [
      ...new Set(
        categories
          .filter((c) => c.block === draft.block)
          .map((c) => c.category),
      ),
    ].sort();
  }, [categories, draft.block]);

  const subcategories = useMemo(() => {
    if (!draft.block || !draft.category) return [];
    return categories
      .filter((c) => c.block === draft.block && c.category === draft.category)
      .sort((a, b) => a.subcategory.localeCompare(b.subcategory));
  }, [categories, draft.block, draft.category]);

  const countryNames = useMemo(
    () => [...new Set(locations.map((l) => l.country))].sort(),
    [locations],
  );

  const citiesInCountry = useMemo(() => {
    if (!draft.country) return [];
    return [
      ...new Set(
        locations
          .filter((l) => l.country === draft.country && l.city)
          .map((l) => l.city as string),
      ),
    ].sort();
  }, [locations, draft.country]);

  /**
   * Never carries `page` over. A filter that keeps you on page 3 of a result
   * set that now has one page lands you on an empty screen.
   */
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
    values.q && { key: "q", label: values.q, clear: { ...values, q: "" } },
    values.block && {
      key: "block",
      label: values.block,
      // Dropping a level drops everything below it, or the remaining values
      // would describe a branch that is no longer selected.
      clear: { ...values, block: "", category: "", categoryId: "" },
    },
    values.category && {
      key: "category",
      label: values.category,
      clear: { ...values, category: "", categoryId: "" },
    },
    values.categoryId && {
      key: "categoryId",
      label:
        categories.find((c) => String(c.id) === values.categoryId)
          ?.subcategory ?? values.categoryId,
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
  ].filter(Boolean) as {
    key: string;
    label: string;
    clear: CatalogueFilterValues;
  }[];

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
        className="grid gap-px border border-border bg-border lg:grid-cols-[1.4fr_repeat(3,0.8fr)_auto]"
      >
        <div className={FIELD}>
          <label htmlFor="filter-q" className={FIELD_LABEL}>
            <Search className="size-3.5" aria-hidden="true" />
            {t("searchPlaceholder")}
          </label>
          <input
            id="filter-q"
            type="text"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            className={CONTROL}
            placeholder={t("searchPlaceholder")}
          />
        </div>

        <div className={FIELD}>
          <label htmlFor="filter-block" className={FIELD_LABEL}>
            <Filter className="size-3.5" aria-hidden="true" />
            {t("categoryPlaceholder")}
          </label>
          <select
            id="filter-block"
            value={draft.block}
            onChange={(e) =>
              setDraft({
                ...draft,
                block: e.target.value,
                category: "",
                categoryId: "",
              })
            }
            className={CONTROL}
          >
            <option value="">{t("allCategories")}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className={FIELD}>
          <label htmlFor="filter-category" className={FIELD_LABEL}>
            <Filter className="size-3.5" aria-hidden="true" />
            {t("subcategoryPlaceholder")}
          </label>
          <select
            id="filter-category"
            value={draft.categoryId || draft.category}
            disabled={!draft.block}
            onChange={(e) => {
              const value = e.target.value;
              // One control, two levels: a category name narrows, a numeric id
              // is an exact subcategory row.
              if (/^\d+$/.test(value)) {
                const row = categories.find((c) => String(c.id) === value);
                setDraft({
                  ...draft,
                  category: row?.category ?? draft.category,
                  categoryId: value,
                });
              } else {
                setDraft({ ...draft, category: value, categoryId: "" });
              }
            }}
            className={`${CONTROL} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <option value="">{t("allSubcategories")}</option>
            {categoriesInBlock.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {subcategories.length > 0 && (
              <optgroup label={draft.category}>
                {subcategories.map((row) => (
                  <option key={row.id} value={String(row.id)}>
                    {row.subcategory}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className={FIELD}>
          <label htmlFor="filter-country" className={FIELD_LABEL}>
            <MapPin className="size-3.5" aria-hidden="true" />
            {t("countryPlaceholder")}
          </label>
          <select
            id="filter-country"
            value={draft.country}
            onChange={(e) =>
              setDraft({ ...draft, country: e.target.value, city: "" })
            }
            className={CONTROL}
          >
            <option value="">{t("allCountries")}</option>
            {countryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="inline-flex min-h-20 cursor-pointer items-center justify-center gap-3 bg-accent px-8 text-xs font-black uppercase tracking-[0.18em] text-accent-foreground transition-colors duration-200 hover:bg-[#b49126] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("filter")}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </button>

        {draft.country && (
          <div className={`${FIELD} lg:col-span-5`}>
            <label htmlFor="filter-city" className={FIELD_LABEL}>
              <MapPin className="size-3.5" aria-hidden="true" />
              {t("cityPlaceholder")}
            </label>
            <select
              id="filter-city"
              value={draft.city}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              className={CONTROL}
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
      </form>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setDraft(chip.clear);
                apply(chip.clear);
              }}
              aria-label={t("removeFilter", { filter: chip.label })}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-border px-3 text-xs font-bold uppercase tracking-[0.12em] transition-colors duration-200 hover:border-accent hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {chip.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY);
              apply(EMPTY);
            }}
            className="min-h-11 cursor-pointer px-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground underline transition-colors duration-200 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("clearFilters")}
          </button>
        </div>
      )}
    </div>
  );
}
