import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getPartnerLocationsAction,
  getPartnersListAction,
} from "@/actions/company";
import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { listActiveCategoryTree } from "@/data/companies";
import {
  DEFAULT_PAGE_SIZE,
  pageParamsFromSearchParam,
} from "@/data/pagination";
import { isFeatureEnabled } from "@/actions/feature-flags";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, Rows3 } from "lucide-react";
import { z } from "zod";

import { CatalogueFilters } from "./_components/catalogue-filters";
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
  const { q, block, category, categoryId, country, city, page, view } =
    searchParamsSchema.parse(raw);
  const currentView = view ?? "grid";
  const currentPage = page ?? 1;

  const [partnerPage, categories, locations] = await Promise.all([
    getPartnersListAction(
      { query: q, block, category, categoryId, country, city },
      pageParamsFromSearchParam(currentPage),
    ),
    listActiveCategoryTree(db),
    getPartnerLocationsAction(),
  ]);

  const partners = partnerPage.rows;
  const pageCount = Math.max(
    1,
    Math.ceil(partnerPage.total / DEFAULT_PAGE_SIZE),
  );

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

    const nextView = overrides.view ?? currentView;
    if (nextView === "list") query.set("view", "list");

    const nextPage = overrides.page ?? currentPage;
    if (nextPage > 1) query.set("page", String(nextPage));

    const qs = query.toString();
    return `/${locale}/directory${qs ? `?${qs}` : ""}`;
  };

  const viewToggle = (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t("viewLabel")}
    >
      {(
        [
          ["grid", LayoutGrid, t("viewGrid")],
          ["list", Rows3, t("viewList")],
        ] as const
      ).map(([value, Icon, label]) => (
        <Link
          key={value}
          href={buildHref({ view: value, page: 1 })}
          aria-label={label}
          aria-pressed={currentView === value}
          className={`inline-flex size-11 cursor-pointer items-center justify-center border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            currentView === value
              ? "border-accent bg-accent/10 text-accent-ink"
              : "border-border text-muted-foreground hover:border-accent hover:text-accent-ink"
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );

  return (
    <main className="border-b border-border bg-background">
      <section className="dark border-b border-border bg-zinc-950 py-16 text-white sm:py-20">
        <div className="kclub-shell">
          <p className="kclub-eyebrow !text-white/55">{t("eyebrow")}</p>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_0.75fr] lg:items-end">
            <div>
              <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-7xl">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-white/65">
                {t("subtitle")}
              </p>
            </div>
            <div className="border-l border-accent pl-5 text-sm font-light leading-7 text-white/60">
              <p>{t("contactsMembersOnly")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="kclub-shell py-10 sm:py-12">
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
          }}
        />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {t("resultCount", { count: partnerPage.total })}
          </p>
          {viewToggle}
        </div>
      </section>

      <section className="kclub-shell pb-20">
        <div
          className={
            currentView === "list"
              ? "grid border-l border-t border-border"
              : "grid border-l border-t border-border md:grid-cols-2 lg:grid-cols-3"
          }
        >
          {partners.length === 0 ? (
            <div className="col-span-full min-h-64 border-b border-r border-border bg-muted/30 p-8 sm:p-12">
              <p className="kclub-eyebrow">{t("filter")}</p>
              <p className="mt-6 max-w-xl text-3xl font-black uppercase leading-tight tracking-[-0.02em]">
                {t("empty")}
              </p>
              <p className="mt-4 max-w-xl text-sm font-light leading-6 text-muted-foreground">
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
              />
            ))
          )}
        </div>

        {pageCount > 1 && (
          <nav
            aria-label={t("paginationLabel")}
            className="mt-10 flex items-center justify-between gap-4"
          >
            {currentPage > 1 ? (
              <Link
                href={buildHref({ page: currentPage - 1 })}
                className="border border-border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] hover:border-accent"
              >
                {t("previousPage")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted-foreground">
              {t("pageOf", { page: currentPage, total: pageCount })}
            </span>
            {currentPage < pageCount ? (
              <Link
                href={buildHref({ page: currentPage + 1 })}
                className="border border-border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] hover:border-accent"
              >
                {t("nextPage")}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
