import { z } from "zod";

/**
 * The four steps of the company submission form (FR-040, ux.md §3.3):
 * business details -> location and category -> the discount offered ->
 * review and confirm.
 *
 * These schemas live outside the Server Action file on purpose: the client
 * validates a step with the same object the server validates it with, so a
 * step cannot pass in the browser and fail on the wire (architecture.md §3.3,
 * CLAUDE.md "the same schema validates on the client").
 */

export const companyDetailsStepSchema = z.object({
  name: z
    .string()
    .min(2, "Company name must be at least 2 characters")
    .max(255),
  legalName: z.string().max(255).optional(),
  taxId: z.string().max(50).optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: z.string().max(1000).optional(),
  specializationDescription: z
    .string()
    .min(2, "Specialization description is required")
    .max(500),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export const companyLocationStepSchema = z
  .object({
    businessCategoryIds: z.preprocess(
      (val): unknown[] => {
        if (Array.isArray(val)) return val as unknown[];
        if (typeof val === "string") return val.split(",").filter(Boolean);
        return [];
      },
      z
        .array(z.coerce.number().int().positive())
        .min(1, "Please select at least one activity")
        .max(7, "You can select up to 7 activities"),
    ),
    registrationCountryCode: z
      .string()
      .regex(/^[A-Z]{2}$/, "Country is required"),
    serviceCountryCodes: z.string().max(1000),
    servesWorldwide: z.enum(["true", "false"]),
    businessFormat: z.enum([
      "offline_only",
      "online_only",
      "online_offline",
      "on_site_service",
    ]),
    administrativeLevel1: z.string().max(255).optional(),
    administrativeLevel2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.servesWorldwide === "false" &&
      !value.serviceCountryCodes.trim()
    ) {
      context.addIssue({ code: "custom", message: "Select a service country" });
    }
    if (value.businessFormat !== "online_only") {
      if (!value.administrativeLevel1?.trim()) {
        context.addIssue({
          code: "custom",
          message: "Administrative level is required",
        });
      }
      if (!value.city?.trim()) {
        context.addIssue({ code: "custom", message: "City is required" });
      }
    }
  });

export const companyOfferStepSchema = z.object({
  discount: z.string().max(255).optional(),
  contactEmail: z
    .string()
    .email("Must be a valid email")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().max(50).optional(),
});

/** Step 4 is review and confirm; it introduces no fields of its own. */
export const COMPANY_FORM_STEPS = 4;

/** Indexed by step number - step 4 has no schema because it adds no fields. */
export const COMPANY_STEP_SCHEMAS = {
  1: companyDetailsStepSchema,
  2: companyLocationStepSchema,
  3: companyOfferStepSchema,
} as const;

export type CompanyStepNumber = 1 | 2 | 3 | 4;

export function isCompanyStep(value: number): value is CompanyStepNumber {
  return Number.isInteger(value) && value >= 1 && value <= COMPANY_FORM_STEPS;
}

export const registerCompanySchema = companyDetailsStepSchema
  .extend(companyLocationStepSchema.shape)
  .extend(companyOfferStepSchema.shape);

/**
 * A draft read back from the database is input, not state we control: it was
 * written by an earlier request and may predate a schema change. Every field
 * is optional on read and unknown keys are dropped.
 */
export const companyDraftDataSchema = registerCompanySchema.partial().extend({
  /**
   * Breadcrumbs for the cascading category select. They are not company
   * fields and are never written to `companies` - without them, resuming a
   * draft could restore the chosen subcategory id but not the two selects
   * above it.
   */
  block: z.string().max(255).optional(),
  category: z.string().max(255).optional(),
});

export type CompanyDraftData = z.infer<typeof companyDraftDataSchema>;
