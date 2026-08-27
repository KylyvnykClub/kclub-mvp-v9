import { describe, expect, it } from "vitest";

import {
  COMPANY_FORM_STEPS,
  COMPANY_STEP_SCHEMAS,
  companyDraftDataSchema,
  companyDetailsStepSchema,
  companyLocationStepSchema,
  companyOfferStepSchema,
  isCompanyStep,
  registerCompanySchema,
} from "./company-form";

/**
 * FR-040: the company application is a four-step form that saves a draft
 * between steps.
 *
 * These are the schema-level guarantees the wizard rests on: a step can be
 * validated on its own without the answers from later steps, the four steps
 * together are exactly the submission schema, and a draft read back from the
 * database cannot smuggle in fields the form does not own.
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

describe("FR-040: four-step company submission form", () => {
  it("declares exactly four steps", () => {
    expect(COMPANY_FORM_STEPS).toBe(4);
    expect(isCompanyStep(1)).toBe(true);
    expect(isCompanyStep(4)).toBe(true);
    expect(isCompanyStep(0)).toBe(false);
    expect(isCompanyStep(5)).toBe(false);
    expect(isCompanyStep(1.5)).toBe(false);
  });

  it("validates step 1 without the answers from steps 2 and 3", () => {
    expect(companyDetailsStepSchema.safeParse(DETAILS).success).toBe(true);
  });

  it("rejects a too-short company name on step 1", () => {
    const result = companyDetailsStepSchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("requires a category, registration country, service coverage and local address on step 2", () => {
    expect(companyLocationStepSchema.safeParse(LOCATION).success).toBe(true);
    expect(companyLocationStepSchema.safeParse({}).success).toBe(false);
  });

  it("coerces category ids from the comma-separated string a multi-select submits", () => {
    const parsed = companyLocationStepSchema.parse(LOCATION);
    expect(parsed.businessCategoryIds).toEqual([7, 12]);
  });

  it("allows an online company to omit city and administrative levels", () => {
    expect(
      companyLocationStepSchema.safeParse({
        ...LOCATION,
        businessFormat: "online_only",
        administrativeLevel1: "",
        city: "",
      }).success,
    ).toBe(true);
  });

  it("requires service countries unless the company serves worldwide", () => {
    expect(
      companyLocationStepSchema.safeParse({
        ...LOCATION,
        serviceCountryCodes: "",
      }).success,
    ).toBe(false);
    expect(
      companyLocationStepSchema.safeParse({
        ...LOCATION,
        serviceCountryCodes: "",
        servesWorldwide: "true",
      }).success,
    ).toBe(true);
  });

  it("treats every field on step 3 as optional - an applicant may offer nothing yet", () => {
    expect(companyOfferStepSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a malformed contact email on step 3", () => {
    expect(
      companyOfferStepSchema.safeParse({ contactEmail: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("has a schema for the three steps that collect fields, and none for review", () => {
    expect(Object.keys(COMPANY_STEP_SCHEMAS)).toEqual(["1", "2", "3"]);
  });

  it("accepts the three steps together as a complete submission", () => {
    const result = registerCompanySchema.safeParse({
      ...DETAILS,
      ...LOCATION,
      ...OFFER,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a submission that is missing a later step, so a draft cannot be submitted early", () => {
    expect(registerCompanySchema.safeParse(DETAILS).success).toBe(false);
  });

  it("accepts a partially filled draft that no completed step would accept yet", () => {
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
   * Steps 1-3 are saved through a Server Action call that carries the string
   * unchanged, and only step 4 is a real form post - so without normalisation
   * the last step rejects text every earlier step accepted.
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

    const result = companyDetailsStepSchema.safeParse({
      ...DETAILS,
      specializationDescription: asBrowserSends(text),
    });

    expect(result.success).toBe(true);
  });

  it("stores the normalised text, so a value at the limit still fits its column", () => {
    const parsed = companyDetailsStepSchema.parse({
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
    const result = companyDetailsStepSchema.safeParse({
      ...DETAILS,
      specializationDescription: "a".repeat(501),
    });

    expect(result.success).toBe(false);
  });

  it("accepts on step 4 what step 1 accepted, for the same typed text", () => {
    const typed = atLimit(500);
    const submission = {
      ...DETAILS,
      ...LOCATION,
      ...OFFER,
      specializationDescription: asBrowserSends(typed),
    };

    expect(
      companyDetailsStepSchema.safeParse({
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
