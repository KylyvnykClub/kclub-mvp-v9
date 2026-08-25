import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getPartnerLocationsAction,
  getPartnersListAction,
} from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { listLocalizedCategoryTree } from "@/data/companies";
import {
  DEFAULT_PAGE_SIZE,
  pageParamsFromSearchParam,
} from "@/data/pagination";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { localeAlternates } from "@/lib/seo";
import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

import {
  CatalogueFilters,
  CatalogueHeaderControls,
} from "./_components/catalogue-filters";
import { PartnerCard } from "./_components/partner-card";

/**
 * Search params are untrusted input like any other request field, so they are
 * parsed rather than read. `catch` rather than a hard failure: a mangled
 * parameter should degrade to the default view, not to an error page.
 */
const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  block: z.string().trim().max(255).optional().catch(undefined),
  category: z.string().trim().max(255).optional().catch(undefined),
  categoryId: z.coerce.number().int().positive().optional().catch(undefined),
  country: z.string().trim().max(255).optional().catch(undefined),
  city: z.string().trim().max(255).optional().catch(undefined),
  mode: z.enum(["online", "offline"]).optional().catch(undefined),
  administrativeLevel1: z.string().trim().max(255).optional().catch(undefined),
  administrativeLevel2: z.string().trim().max(255).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
  view: z.enum(["grid", "list"]).optional().catch(undefined),
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalogue" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // Canonical points at the unfiltered catalogue: the q/category/city/page/…
    // params produce endless faceted URLs that must all consolidate here.
    alternates: localeAlternates(locale, "/directory"),
  };
}

export default async function CatalogueDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("catalogue");

  const session = await getCurrentMember();
  if (!session?.member) {
    const isPublic = await isFeatureEnabled("public_catalogue");
    if (!isPublic) {
      redirect(`/${locale}/login`);
    }
  }

  const raw = await searchParams;
  const {
    q,
    block,
    category,
    categoryId,
    country,
    city,
    mode,
    administrativeLevel1,
    administrativeLevel2,
    page,
    view,
  } = searchParamsSchema.parse(raw);
  const currentView = view ?? "grid";
  const currentPage = page ?? 1;

  const [partnerPage, totalPartnerPage, categories, locations] =
    await Promise.all([
      getPartnersListAction(
        {
          query: q,
          block,
          category,
          categoryId,
          serviceCountryCode: country,
          city,
          businessMode: mode,
          administrativeLevel1,
          administrativeLevel2,
        },
        pageParamsFromSearchParam(currentPage),
      ),
      getPartnersListAction({}, pageParamsFromSearchParam(1)),
      listLocalizedCategoryTree(db, locale as "en" | "ru" | "uk"),
      getPartnerLocationsAction(),
    ]);

  const partners = partnerPage.rows;
  const pageCount = Math.max(
    1,
    Math.ceil(partnerPage.total / DEFAULT_PAGE_SIZE),
  );
  const countryCount = new Set(locations.map((location) => location.country))
    .size;
  const rangeFrom =
    partnerPage.total === 0 ? 0 : (currentPage - 1) * DEFAULT_PAGE_SIZE + 1;
  const rangeTo = Math.min(currentPage * DEFAULT_PAGE_SIZE, partnerPage.total);

  // Keep every filter and the chosen view when moving between pages; dropping
  // them would page through a different result set than the one on screen.
  const buildHref = (overrides: { page?: number; view?: "grid" | "list" }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (block) query.set("block", block);
    if (category) query.set("category", category);
    if (categoryId) query.set("categoryId", String(categoryId));
    if (country) query.set("country", country);
    if (city) query.set("city", city);
    if (mode) query.set("mode", mode);
    if (administrativeLevel1)
      query.set("administrativeLevel1", administrativeLevel1);
    if (administrativeLevel2)
      query.set("administrativeLevel2", administrativeLevel2);

    const nextView = overrides.view ?? currentView;
    if (nextView === "list") query.set("view", "list");

    const nextPage = overrides.page ?? currentPage;
    if (nextPage > 1) query.set("page", String(nextPage));

    const qs = query.toString();
    return `/${locale}/directory${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="border-b border-border bg-background">
      <section className="border-b border-border bg-background/90 backdrop-blur-xl lg:sticky lg:top-[72px] lg:z-30">
        <CatalogueHeaderControls
          categories={categories}
          countryCount={countryCount}
          locations={locations}
          shownCount={partnerPage.total}
          totalCount={totalPartnerPage.total}
          view={currentView}
          values={{
            q: q ?? "",
            block: block ?? "",
            category: category ?? "",
            categoryId: categoryId ? String(categoryId) : "",
            country: country ?? "",
            city: city ?? "",
            mode: mode ?? "",
            administrativeLevel1: administrativeLevel1 ?? "",
            administrativeLevel2: administrativeLevel2 ?? "",
          }}
        />
      </section>

      <section className="mx-auto grid max-w-[1360px] min-w-0 gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10">
        <CatalogueFilters
          categories={categories}
          locations={locations}
          view={currentView}
          values={{
            q: q ?? "",
            block: block ?? "",
            category: category ?? "",
            categoryId: categoryId ? String(categoryId) : "",
            country: country ?? "",
            city: city ?? "",
            mode: mode ?? "",
            administrativeLevel1: administrativeLevel1 ?? "",
            administrativeLevel2: administrativeLevel2 ?? "",
          }}
        />

        <div className="min-w-0">
          <div
            className={
              currentView === "list"
                ? "grid min-w-0 grid-cols-1 gap-5"
                : "grid min-w-0 grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3"
            }
          >
            {partners.length === 0 ? (
              <div className="col-span-full rounded-lg border border-border bg-card p-10 text-center sm:p-16">
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
                <p className="mt-2 text-sm text-muted-foreground/60">
                  {t("emptyHint")}
                </p>
              </div>
            ) : (
              partners.map((partner) => (
                <PartnerCard
                  key={partner.id}
                  partner={partner}
                  href={`/${locale}/directory/${partner.slug}`}
                  view={currentView}
                  noDescription={t("noDescription")}
                  detailsLabel={t("details")}
                  verifiedLabel={t("verifiedPartner")}
                />
              ))
            )}
          </div>

          {pageCount > 1 && (
            <nav
              aria-label={t("paginationLabel")}
              className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
            >
              <span className="font-mono text-xs text-muted-foreground/60">
                {t("rangeOf", {
                  from: rangeFrom,
                  to: rangeTo,
                  total: partnerPage.total,
                })}
              </span>

              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={buildHref({ page: currentPage - 1 })}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border text-sm text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                    aria-label={t("previousPage")}
                  >
                    ←
                  </Link>
                ) : (
                  <span className="inline-flex size-9 items-center justify-center rounded-md border border-border text-sm text-muted-foreground/30">
                    ←
                  </span>
                )}

                <span className="rounded-md border border-accent bg-secondary px-3 py-2 font-mono text-xs text-foreground">
                  {t("pageOf", { page: currentPage, total: pageCount })}
                </span>

                {currentPage < pageCount ? (
                  <Link
                    href={buildHref({ page: currentPage + 1 })}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border text-sm text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                    aria-label={t("nextPage")}
                  >
                    →
                  </Link>
                ) : (
                  <span className="inline-flex size-9 items-center justify-center rounded-md border border-border text-sm text-muted-foreground/30">
                    →
                  </span>
                )}
              </div>
            </nav>
          )}
        </div>
      </section>
    </main>
  );
}
