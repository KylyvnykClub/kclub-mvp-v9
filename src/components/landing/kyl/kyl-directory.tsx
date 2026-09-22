"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { KylEmptyState, KylPartnerCard } from "./kyl-partner-card";
import { KylSelect } from "./kyl-select";
import { KylReveal } from "./kyl-reveal";

import { flagSrc } from "./partner-presentation";

import { searchLandingPartnersAction } from "@/actions/landing-search";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { LandingPartner } from "@/lib/landing-partner";

/**
 * "Find Your Next Partner": the catalogue's own search, on the landing page.
 *
 * The prototype filtered nine cards that were already in the HTML. That reads
 * as a search of the network and is a search of one screen, which stops being
 * true the day the club has ten partners - so this asks the catalogue instead,
 * through the same action and the same gate the catalogue page uses, and the
 * count under the form is the real total rather than the number of cards drawn.
 *
 * The first page is rendered on the server, so the section has content with no
 * JavaScript and a search engine sees partners rather than an empty grid. The
 * filters then refine it: 300 ms after the last keystroke, which is late enough
 * that typing a word is one query rather than seven, and the submit button
 * skips the wait for a reader who would rather press it.
 */
type Option = { value: string; label: string };

export function KylDirectory({
  initial,
  total,
  locale,
  countries,
  cities,
  blocks,
}: {
  initial: LandingPartner[];
  total: number;
  locale: Locale;
  countries: Option[];
  /** Every city with the country it belongs to, so the select can narrow. */
  cities: { value: string; label: string; country: string }[];
  blocks: Option[];
}) {
  const t = useTranslations("home.kyl.directory");

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [block, setBlock] = useState("");

  const [rows, setRows] = useState(initial);
  const [count, setCount] = useState(total);
  const [pending, startTransition] = useTransition();

  // The first render already carries the server's unfiltered page; searching
  // for it again on mount would be a wasted round trip and a visible flash.
  const mounted = useRef(false);

  function search() {
    startTransition(async () => {
      const result = await searchLandingPartnersAction({
        query,
        country,
        city,
        block,
        locale,
      });
      setRows(result.rows);
      setCount(result.total);
    });
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const handle = setTimeout(search, 300);
    return () => clearTimeout(handle);
    // `search` is recreated every render; the filters are what should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, country, city, block, locale]);

  function reset() {
    setQuery("");
    setCountry("");
    setCity("");
    setBlock("");
  }

  const visibleCities = country
    ? cities.filter((entry) => entry.country === country)
    : cities;

  const catalogueHref = (() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (block) params.set("block", block);
    const search = params.toString();
    return search ? `/directory?${search}` : "/directory";
  })();

  return (
    <section
      className="partners section"
      id="partners"
      aria-labelledby="partners-title"
    >
      <div className="shell">
        <KylReveal className="section-heading partner-heading">
          <h2 id="partners-title">{t("title")}</h2>
          <p>{t("lede")}</p>
        </KylReveal>

        <KylReveal
          as="form"
          className="partner-search"
          role="search"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            search();
          }}
        >
          <label className="search-field">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden="true" />
            <input
              type="search"
              name="query"
              value={query}
              placeholder={t("placeholder")}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label>
            <span>{t("country")}</span>
            <KylSelect
              label={t("country")}
              value={country}
              options={[
                { value: "", label: t("allCountries") },
                ...countries.map((option) => ({
                  ...option,
                  icon: flagSrc(option.value) ?? undefined,
                })),
              ]}
              onChange={(next) => {
                setCountry(next);
                setCity("");
              }}
            />
          </label>

          <label>
            <span>{t("city")}</span>
            <KylSelect
              label={t("city")}
              value={city}
              options={[
                { value: "", label: t("allCities") },
                ...visibleCities.map(({ value, label }) => ({ value, label })),
              ]}
              onChange={setCity}
            />
          </label>

          <label>
            <span>{t("category")}</span>
            <KylSelect
              label={t("category")}
              value={block}
              options={[{ value: "", label: t("allCategories") }, ...blocks]}
              onChange={setBlock}
            />
          </label>

          <button className="button search-button" type="submit">
            {t("submit")}
          </button>
        </KylReveal>

        <KylReveal className="results-bar">
          <p aria-live="polite">
            <span>{count}</span> {t("results", { count })}
          </p>
          <button type="button" onClick={reset}>
            {t("reset")}
          </button>
        </KylReveal>

        {rows.length > 0 ? (
          <div className="partner-grid" data-pending={pending}>
            {rows.map((partner) => (
              <KylPartnerCard
                key={partner.id}
                partner={partner}
                benefitLabel={t("memberBenefit")}
              />
            ))}
          </div>
        ) : (
          <KylEmptyState
            title={t("emptyTitle")}
            text={t("emptyText")}
            action={t("emptyAction")}
            onReset={reset}
          />
        )}

        {count > rows.length && (
          <Link
            className="button-tertiary top-partners-all"
            href={catalogueHref}
          >
            {t("viewAll")}
          </Link>
        )}
      </div>
    </section>
  );
}
