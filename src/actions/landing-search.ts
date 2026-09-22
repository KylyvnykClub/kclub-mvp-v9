"use server";

import { z } from "zod";

import { getPartnersListAction } from "./company";

import { db } from "@/data/db";
import { listLocalizedCategoryLabels } from "@/data/companies";
import { locales } from "@/i18n/routing";
import { toLandingPartner, type LandingPartner } from "@/lib/landing-partner";

/**
 * Nine cards, which is the 3x3 grid the design draws. Anything past that is a
 * reason to open the catalogue, and the section says so with a link and the
 * real total.
 */
const LANDING_PAGE_SIZE = 9;

/**
 * The landing page's partner search, as the reader types.
 *
 * It does not query anything itself: it calls `getPartnersListAction`, which is
 * the catalogue's own path and carries the catalogue's own gate (a member, or
 * the `public_catalogue` flag). A second search path would be a second place to
 * get that authorisation wrong.
 *
 * What it adds is the narrowing: the catalogue row carries its owner, its
 * moderation history and its whole taxonomy, and the card needs nine fields.
 * Mapping here means those nine fields are what crosses to the browser.
 *
 * A Server Action is a public HTTP endpoint, so the filters are parsed rather
 * than trusted, and a malformed one degrades to "no filter" exactly as the
 * catalogue page's own `catch` does.
 */
const filtersSchema = z.object({
  query: z.string().trim().max(120).optional().catch(undefined),
  country: z.string().trim().max(255).optional().catch(undefined),
  city: z.string().trim().max(255).optional().catch(undefined),
  block: z.string().trim().max(255).optional().catch(undefined),
  locale: z.enum(locales).catch("en"),
});

export type LandingSearchInput = z.input<typeof filtersSchema>;

export async function searchLandingPartnersAction(
  input: LandingSearchInput,
): Promise<{ rows: LandingPartner[]; total: number }> {
  const { locale, ...filters } = filtersSchema.parse(input);

  const { rows, total } = await getPartnersListAction(
    {
      query: filters.query || undefined,
      serviceCountryCode: filters.country || undefined,
      city: filters.city || undefined,
      block: filters.block || undefined,
    },
    { limit: LANDING_PAGE_SIZE, offset: 0 },
  );

  const ids = [
    ...new Set(
      rows.flatMap((row) => row.categories.map((c) => c.businessCategoryId)),
    ),
  ];
  const labels = await listLocalizedCategoryLabels(db, locale, ids);

  return {
    rows: rows.map((row) =>
      toLandingPartner(row, new Map(labels.map((l) => [l.id, l]))),
    ),
    total,
  };
}
