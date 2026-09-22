/**
 * What a partner card on the landing page actually needs.
 *
 * The catalogue row carries its categories, its service countries, its owner
 * and its moderation history; a card shows nine fields. The narrowing happens
 * here so the search action ships nine fields to the browser rather than the
 * row - and so the same shape is produced whether the cards were rendered on
 * the server or fetched while the reader typed.
 */
export type LandingPartner = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  discount: string | null;
  logoUrl: string | null;
  city: string | null;
  countryCode: string | null;
  /** The reader's language, for the card's meta line. */
  category: string | null;
  /** English and stable, for the icon and the colour. */
  blockKey: string | null;
};

type CategoryLabel = { id: number; blockKey: string; category: string };

type CatalogueRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  discount: string | null;
  logoUrl: string | null;
  city: string | null;
  registrationCountryCode: string | null;
  categories: { businessCategoryId: number }[];
};

export function toLandingPartner(
  row: CatalogueRow,
  labels: Map<number, CategoryLabel>,
): LandingPartner {
  const label = row.categories
    .map((entry) => labels.get(entry.businessCategoryId))
    .find((entry) => entry !== undefined);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    discount: row.discount,
    logoUrl: row.logoUrl,
    city: row.city,
    countryCode: row.registrationCountryCode,
    category: label?.category ?? null,
    blockKey: label?.blockKey ?? null,
  };
}
