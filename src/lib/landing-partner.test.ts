import { describe, expect, it } from "vitest";

import { toLandingPartner } from "@/lib/landing-partner";

/**
 * FR-030/FR-035: what a landing-page partner card is allowed to carry.
 *
 * The narrowing is the test's subject. `searchLandingPartnersAction` runs on
 * every keystroke and returns its result to the browser, so a field that slips
 * into this shape is a field published to anyone who opens the home page.
 */
const labels = new Map([
  [12, { id: 12, blockKey: "Legal, Finance & Security", category: "Notary" }],
  [40, { id: 40, blockKey: "IT, Marketing, Design & Media", category: "SEO" }],
]);

const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  slug: "swiss-legal-group",
  name: "Swiss Legal Group",
  description: "Cross-border contracts.",
  discount: "−20%",
  logoUrl: null,
  city: "Zürich",
  registrationCountryCode: "CH",
  categories: [{ businessCategoryId: 12 }],
  ...over,
});

describe("toLandingPartner (FR-035: the landing card's fields)", () => {
  it("carries the nine fields a card draws and nothing else", () => {
    const partner = toLandingPartner(
      row({ ownerId: "member-1", moderationStatus: "approved" }),
      labels,
    );

    expect(Object.keys(partner).sort()).toEqual([
      "blockKey",
      "category",
      "city",
      "countryCode",
      "description",
      "discount",
      "id",
      "logoUrl",
      "name",
      "slug",
    ]);
  });

  it("labels the partner with its first known category, in the reader's language", () => {
    const partner = toLandingPartner(row(), labels);

    expect(partner.category).toBe("Notary");
    expect(partner.blockKey).toBe("Legal, Finance & Security");
  });

  it("skips a category the label index does not know", () => {
    const partner = toLandingPartner(
      row({
        categories: [{ businessCategoryId: 999 }, { businessCategoryId: 40 }],
      }),
      labels,
    );

    expect(partner.category).toBe("SEO");
  });

  it("leaves the taxonomy null for a partner filed under nothing", () => {
    // A company that predates the taxonomy: the card then shows its country
    // only, rather than inventing a category for it.
    const partner = toLandingPartner(row({ categories: [] }), labels);

    expect(partner.category).toBeNull();
    expect(partner.blockKey).toBeNull();
  });
});
