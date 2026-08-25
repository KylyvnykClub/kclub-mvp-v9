import type { MetadataRoute } from "next";

import { isFeatureEnabled } from "@/actions/feature-flags";
import { db } from "@/data/db";
import {
  listCompanyIdsWithActiveSubscription,
  listPublicPartnerSlugs,
} from "@/data/companies";
import { absoluteUrl, localeAlternates } from "@/lib/seo";
import { locales } from "@/i18n/routing";

const SKIP_DB_PRERENDER = process.env.KCLUB_SKIP_DB_PRERENDER === "1";

/**
 * One sitemap entry per locale for a given locale-less path, each carrying the
 * full hreflang cluster so the three language variants are advertised as
 * alternates rather than duplicates.
 */
function entriesFor(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: absoluteUrl(`/${locale}${path}`),
    changeFrequency,
    priority,
    alternates: { languages: localeAlternates(locale, path).languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    ...entriesFor("", 1, "weekly"),
    ...entriesFor("/directory", 0.8, "daily"),
    ...entriesFor("/legal", 0.3, "yearly"),
  ];

  // Partner landing pages are only reachable - and so only worth advertising -
  // when the public catalogue is on. The DB is wrapped defensively: a sitemap
  // must still render from its static routes if the database is unreachable or
  // skipped during prerender.
  if (!SKIP_DB_PRERENDER) {
    try {
      if (await isFeatureEnabled("public_catalogue")) {
        const ids = await listCompanyIdsWithActiveSubscription(db);
        const slugs = await listPublicPartnerSlugs(db, ids);
        for (const slug of slugs) {
          entries.push(...entriesFor(`/directory/${slug}`, 0.7, "weekly"));
        }
      }
    } catch {
      // Static routes above are enough to return a valid sitemap.
    }
  }

  return entries;
}
