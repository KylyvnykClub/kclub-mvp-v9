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
  businessCategoryId: "7",
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

  it("coerces the category id from the string a select element submits", () => {
    const parsed = companyLocationStepSchema.parse(LOCATION);
    expect(parsed.businessCategoryId).toBe(7);
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
