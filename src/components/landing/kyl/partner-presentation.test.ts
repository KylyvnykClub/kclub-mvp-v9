import { describe, expect, it } from "vitest";

import {
  blockPresentation,
  buildTaxonomyIndex,
  flagSrc,
  partnerTaxonomy,
} from "./partner-presentation";

/**
 * The prototype hard-coded nine cards with nine colours. Real partners are not
 * those nine, so the colour and the icon are looked up from the taxonomy block
 * - and a block nobody anticipated must still produce a card.
 */
describe("blockPresentation", () => {
  it("gives a known block its own artwork", () => {
    expect(blockPresentation("Legal, Finance & Security").art).toBe(
      "art-legal",
    );
    expect(blockPresentation("IT, Marketing, Design & Media").art).toBe(
      "art-tech",
    );
  });

  it("falls back to the business panel for a block it has never seen", () => {
    expect(blockPresentation("Something Staff Added Yesterday").art).toBe(
      "art-business",
    );
    expect(blockPresentation(null).art).toBe("art-business");
  });

  it("always returns an icon, so a card is never drawn empty", () => {
    expect(blockPresentation(null).Icon).toBeTypeOf("object");
  });
});

describe("partnerTaxonomy", () => {
  const index = buildTaxonomyIndex([
    {
      id: 1,
      blockKey: "Healthcare, Health & Care",
      block: "Медицина",
      category: "Стоматологія",
    },
    {
      id: 2,
      blockKey: "Beauty, Fitness & Recovery",
      block: "Краса",
      category: "Фітнес",
    },
  ]);

  it("returns the first entry the index knows", () => {
    expect(partnerTaxonomy([9, 2], index)?.category).toBe("Фітнес");
  });

  it("returns null when none of the ids are in the index", () => {
    expect(partnerTaxonomy([9, 10], index)).toBeNull();
    expect(partnerTaxonomy([], index)).toBeNull();
  });
});

describe("flagSrc", () => {
  it("names the file for an ISO 3166-1 alpha-2 code", () => {
    expect(flagSrc("CH")).toBe("/flags/ch.png");
  });

  it("refuses anything that is not a code, because companies.country is free text", () => {
    // `companies.country` is a varchar(100) that may hold "Poland"; a request
    // for /flags/poland.png is a 404 on every card in the grid.
    expect(flagSrc("Poland")).toBeNull();
    expect(flagSrc(null)).toBeNull();
    expect(flagSrc("")).toBeNull();
  });
});
