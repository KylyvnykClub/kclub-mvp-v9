import type { MetadataRoute } from "next";

import { isFeatureEnabled } from "@/actions/feature-flags";
import { db } from "@/data/db";
import {
  listCompanyIdsWithPaidListing,
  listPublicPartnersForSitemap,
} from "@/data/companies";
import { getAllLegalDocuments } from "@/lib/mdx";
import { absoluteUrl, localeAlternates } from "@/lib/seo";
import {
  companyImageServePath,
  companyLogoServePath,
} from "@/lib/company-image-path";
import { locales } from "@/i18n/routing";

/**
 * The sitemap, as search engines read sitemaps today (sitemaps.org protocol
 * 0.9, with Google's hreflang and image extensions):
 *
 * - every indexable page, in each locale, with the full hreflang cluster
 *   (`xhtml:link`, `x-default` included), so the three languages are
 *   alternates rather than duplicates;
 * - `lastmod` wherever there is an honest date - a partner's own last
 *   change, the newest partner for the pages that list them, a legal
 *   document's front matter. Google uses `lastmod` only when it is
 *   consistently accurate, so a page with no real date gets none rather
 *   than "now";
 * - each partner's logo and photos (`image:image`), which the catalogue
 *   serves from routes robots.txt allows;
 * - no `changefreq` or `priority`: Google ignores both, and stale values
 *   only mislead the engines that do not.
 *
 * Regenerated hourly, so a partner approved today is listed today rather
 * than at the next deployment.
 */
export const revalidate = 3600;

const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

function entriesFor(
  path: string,
  options: { lastModified?: Date; images?: string[] } = {},
): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: absoluteUrl(`/${locale}${path}`),
    ...(options.lastModified ? { lastModified: options.lastModified } : {}),
    ...(options.images && options.images.length > 0
      ? { images: options.images }
      : {}),
    alternates: { languages: localeAlternates(locale, path).languages },
  }));
}

/** Every legal document, dated by its own front matter. */
async function legalEntries(): Promise<{
  entries: MetadataRoute.Sitemap;
  newest: Date | null;
}> {
  const documents = await getAllLegalDocuments(locales[0]);
  let newest: Date | null = null;
  const entries = documents.flatMap((document) => {
    const updated = new Date(document.lastUpdated);
    const valid = !Number.isNaN(updated.getTime());
    if (valid && (!newest || updated > newest)) newest = updated;
    return entriesFor(`/legal/${document.id}`, {
      lastModified: valid ? updated : undefined,
    });
  });
  return { entries, newest };
}

/** Published partners, their pictures, and the newest change among them. */
async function partnerEntries(): Promise<{
  entries: MetadataRoute.Sitemap;
  newest: Date | null;
}> {
  // A sitemap must still render from its static pages if the database is
  // unreachable or skipped during prerender.
  if (SKIP_DB_PRERENDER) return { entries: [], newest: null };
  try {
    if (!(await isFeatureEnabled("public_catalogue"))) {
      return { entries: [], newest: null };
    }
    const ids = await listCompanyIdsWithPaidListing(db, new Date());
    const partners = await listPublicPartnersForSitemap(db, ids);
    let newest: Date | null = null;
    const entries = partners.flatMap((partner) => {
      if (!newest || partner.updatedAt > newest) newest = partner.updatedAt;
      const images = [
        ...(partner.hasLogo ? [companyLogoServePath(partner.id)] : []),
        ...partner.imageIds.map((id) => companyImageServePath(id)),
      ].map((path) => absoluteUrl(path));
      return entriesFor(`/directory/${partner.slug}`, {
        lastModified: partner.updatedAt,
        images,
      });
    });
    return { entries, newest };
  } catch {
    return { entries: [], newest: null };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [legal, partners] = await Promise.all([
    legalEntries(),
    partnerEntries(),
  ]);

  return [
    // The home page and the catalogue list partners: they change when one
    // does.
    ...entriesFor("", { lastModified: partners.newest ?? undefined }),
    ...entriesFor("/directory", {
      lastModified: partners.newest ?? undefined,
    }),
    ...entriesFor("/pricing"),
    ...entriesFor("/legal", { lastModified: legal.newest ?? undefined }),
    ...legal.entries,
    ...partners.entries,
  ];
}
