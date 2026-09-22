import {
  BriefcaseBusiness,
  CarFront,
  ChartNoAxesCombined,
  CodeXml,
  Dumbbell,
  HeartPulse,
  House,
  Plane,
  Scale,
  type LucideIcon,
} from "lucide-react";

import type { CategoryLabelRow } from "@/data/companies";

/**
 * How a partner is drawn on the landing page when it has no photograph.
 *
 * The prototype hard-coded nine cards, each with its own `art-*` colour and its
 * own Lucide glyph. Real partners are not nine and are not those nine, so the
 * pairing is keyed on the taxonomy block instead - which is English, stable and
 * what the catalogue filters on. A block with no entry here is not a missing
 * tile, it is the business block: a neutral panel and a briefcase.
 *
 * The colours are the prototype's, unchanged; only what selects them is new.
 */
const BLOCK_PRESENTATION: Record<string, { art: string; Icon: LucideIcon }> = {
  "Legal, Finance & Security": { art: "art-legal", Icon: Scale },
  "Healthcare, Health & Care": { art: "art-dental", Icon: HeartPulse },
  "Beauty, Fitness & Recovery": { art: "art-fitness", Icon: Dumbbell },
  "Real Estate, Construction & Home Services": {
    art: "art-realty",
    Icon: House,
  },
  "Automotive, Transportation & Logistics": { art: "art-auto", Icon: CarFront },
  "Business & Professional Services": {
    art: "art-business",
    Icon: BriefcaseBusiness,
  },
  "Manufacturing, Trade & Agriculture": {
    art: "art-finance",
    Icon: ChartNoAxesCombined,
  },
  "IT, Marketing, Design & Media": { art: "art-tech", Icon: CodeXml },
  "Hospitality, Education & Personal Services": {
    art: "art-travel",
    Icon: Plane,
  },
};

const FALLBACK = { art: "art-business", Icon: BriefcaseBusiness };

export function blockPresentation(blockKey: string | null) {
  return (blockKey && BLOCK_PRESENTATION[blockKey]) || FALLBACK;
}

export type TaxonomyLabel = {
  blockKey: string;
  block: string;
  category: string;
};

export type TaxonomyIndex = Map<number, TaxonomyLabel>;

export function buildTaxonomyIndex(rows: CategoryLabelRow[]): TaxonomyIndex {
  return new Map(
    rows.map((row) => [
      row.id,
      { blockKey: row.blockKey, block: row.block, category: row.category },
    ]),
  );
}

/**
 * The first taxonomy entry a partner is filed under, in the reader's language.
 *
 * A partner may carry several; the card has room for one, and the first is the
 * one the owner chose first. Returns null rather than a placeholder when the
 * partner predates the taxonomy - the card then simply shows its country.
 */
export function partnerTaxonomy(
  categoryIds: number[],
  index: TaxonomyIndex,
): TaxonomyLabel | null {
  for (const id of categoryIds) {
    const label = index.get(id);
    if (label) return label;
  }
  return null;
}

/** `/flags/ch.png` for "CH", and nothing for a value that is not a code. */
export function flagSrc(code: string | null | undefined): string | null {
  return code && /^[A-Za-z]{2}$/.test(code)
    ? `/flags/${code.toLowerCase()}.png`
    : null;
}
