import { describe, expect, it } from "vitest";

import {
  companyDraftDataSchema,
  companyDetailsSchema,
  companyLocationSchema,
  companyMediaSchema,
  registerCompanySchema,
} from "./company-form";

/**
 * FR-040, FR-109: the company application is one page that keeps a draft of
 * what has been typed so far.
 *
 * These are the schema-level guarantees the form rests on: a group of fields
 * can be validated on its own, the three groups together are exactly the
 * submission schema, and a draft read back from the database cannot smuggle
 * in fields the form does not own.
 */

const DETAILS = {
  name: "Acme Coffee",
  specializationDescription: "Coffee roasting and tasting sessions",
};
const LOCATION = {
  businessCategoryIds: "7,12",
  registrationCountryCode: "UA",
  serviceCountryCodes: "UA,PL",
  servesWorldwide: "false",
  businessFormat: "offline_only",
  administrativeLevel1: "Kyiv",
  city: "Kyiv",
};
const OFFER = { discount: "15% for members" };

describe("FR-040, FR-109: one-page company submission form", () => {
  it("validates the business details without the answers below them", () => {
    expect(companyDetailsSchema.safeParse(DETAILS).success).toBe(true);
  });

  it("rejects a too-short company name", () => {
    const result = companyDetailsSchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("requires a category, registration country, service coverage and local address", () => {
    expect(companyLocationSchema.safeParse(LOCATION).success).toBe(true);
    expect(companyLocationSchema.safeParse({}).success).toBe(false);
  });

  it("coerces category ids from the comma-separated string a multi-select submits", () => {
    const parsed = companyLocationSchema.parse(LOCATION);
    expect(parsed.businessCategoryIds).toEqual([7, 12]);
  });

  it("allows an online company to omit city and administrative levels", () => {
    expect(
      companyLocationSchema.safeParse({
        ...LOCATION,
        businessFormat: "online_only",
        administrativeLevel1: "",
        city: "",
      }).success,
    ).toBe(true);
  });

  it("requires service countries unless the company serves worldwide", () => {
    expect(
      companyLocationSchema.safeParse({
        ...LOCATION,
        serviceCountryCodes: "",
      }).success,
    ).toBe(false);
    expect(
      companyLocationSchema.safeParse({
        ...LOCATION,
        serviceCountryCodes: "",
        servesWorldwide: "true",
      }).success,
    ).toBe(true);
  });

  it("treats every media field as optional - a company without photos is still a company", () => {
    expect(companyMediaSchema.safeParse({}).success).toBe(true);
    expect(
      companyMediaSchema.safeParse({
        logoStaged: "true",
        galleryImageIds:
          "a64d7c85-26bf-4d9b-a460-356d86080dd1,0f0e4a3e-3d8e-4c8e-9a1c-9b2f7d6e5c4b",
      }).success,
    ).toBe(true);
  });

  it("rejects a staged image list that is not a list of ids", () => {
    expect(
      companyMediaSchema.safeParse({ galleryImageIds: "../etc/passwd" })
        .success,
    ).toBe(false);
  });

  it("rejects a malformed contact email, where contacts live since ADR 0024", () => {
    expect(
      companyDetailsSchema.safeParse({
        ...DETAILS,
        contactEmail: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("puts no cap on service countries and asks for no administrative level", () => {
    const many = Array.from(
      { length: 60 },
      (_, i) =>
        String.fromCharCode(65 + (i % 26)) +
        String.fromCharCode(65 + ((i * 7) % 26)),
    ).join(",");
    expect(
      companyLocationSchema.safeParse({
        ...LOCATION,
        administrativeLevel1: undefined,
        serviceCountryCodes: many,
      }).success,
    ).toBe(true);
  });

  it("accepts the three groups together as a complete submission", () => {
    const result = registerCompanySchema.safeParse({
      ...DETAILS,
      ...LOCATION,
      ...OFFER,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a submission that is missing a whole group, so a draft cannot be submitted early", () => {
    expect(registerCompanySchema.safeParse(DETAILS).success).toBe(false);
  });

  it("accepts a partially filled draft that no complete group would accept yet", () => {
    const result = companyDraftDataSchema.safeParse({ name: "Acme Coffee" });
    expect(result.success).toBe(true);
  });

  it("drops unknown keys from a stored draft rather than carrying them forward", () => {
    const parsed = companyDraftDataSchema.parse({
      name: "Acme Coffee",
      moderationStatus: "approved",
      ownerId: "someone-else",
    });

    expect(parsed).not.toHaveProperty("moderationStatus");
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed.name).toBe("Acme Coffee");
  });

  it("keeps the category breadcrumbs a draft needs to restore its selects", () => {
    const parsed = companyDraftDataSchema.parse({
      block: "Services",
      category: "Food",
    });

    expect(parsed.block).toBe("Services");
    expect(parsed.category).toBe("Food");
  });

  /**
   * A browser serialising a form rewrites every line break as CRLF, so a value
   * the textarea counted as 500 characters reaches the Server Action as 503.
   * The draft is saved through a Server Action call that carries the string
   * unchanged, while submission is a real form post - so without normalisation
   * the submission rejects text the draft accepted.
   */
  const atLimit = (limit: number) => {
    const paragraph = "a".repeat(Math.floor(limit / 3) - 1);
    const text = [paragraph, paragraph, paragraph].join("\n");
    return text + "a".repeat(limit - text.length);
  };
  const asBrowserSends = (text: string) => text.replace(/\n/g, "\r\n");

  it("accepts a specialization at the limit that the browser sends with CRLF breaks", () => {
    const text = atLimit(500);
    expect(text).toHaveLength(500);
    expect(asBrowserSends(text).length).toBeGreaterThan(500);

    const result = companyDetailsSchema.safeParse({
      ...DETAILS,
      specializationDescription: asBrowserSends(text),
    });

    expect(result.success).toBe(true);
  });

  it("stores the normalised text, so a value at the limit still fits its column", () => {
    const parsed = companyDetailsSchema.parse({
      ...DETAILS,
      description: asBrowserSends(atLimit(1000)),
      specializationDescription: asBrowserSends(atLimit(500)),
    });

    expect(parsed.specializationDescription).toHaveLength(500);
    expect(parsed.specializationDescription).not.toContain("\r");
    expect(parsed.description).toHaveLength(1000);
    expect(parsed.description).not.toContain("\r");
  });

  it("still rejects text that is over the limit once the breaks are normalised", () => {
    const result = companyDetailsSchema.safeParse({
      ...DETAILS,
      specializationDescription: "a".repeat(501),
    });

    expect(result.success).toBe(false);
  });

  it("accepts on submission what the draft accepted, for the same typed text", () => {
    const typed = atLimit(500);
    const submission = {
      ...DETAILS,
      ...LOCATION,
      ...OFFER,
      specializationDescription: asBrowserSends(typed),
    };

    expect(
      companyDetailsSchema.safeParse({
        ...DETAILS,
        specializationDescription: typed,
      }).success,
    ).toBe(true);
    expect(registerCompanySchema.safeParse(submission).success).toBe(true);
  });

  it("does not let the breadcrumbs reach a submission", () => {
    const parsed = registerCompanySchema.parse({
      ...DETAILS,
      ...LOCATION,
      ...OFFER,
      block: "Services",
      category: "Food",
    });

    expect(parsed).not.toHaveProperty("block");
    expect(parsed).not.toHaveProperty("category");
  });
});
