import { z } from "zod";

/**
 * What a company application must contain (FR-040, FR-109, ux.md §3.3).
 *
 * Three groups rather than one object, because they are three different
 * questions - what the business says about itself, where and under what
 * category it operates, and what it staged as media - and an error that names
 * its group is easier to act on than one that names a field in a wall of
 * eighteen.
 *
 * They live outside the Server Action file on purpose: the form validates with
 * the same objects the server validates with, so a submission cannot pass in
 * the browser and fail on the wire (architecture.md §3.3, CLAUDE.md "the same
 * schema validates on the client").
 */

/**
 * Wrap a free-text field so its line breaks are counted the way the applicant
 * sees them.
 *
 * A browser serialising a form rewrites every line break as CRLF, so a value a
 * `maxLength={500}` textarea accepted arrives at the Server Action as 503
 * characters. The draft is saved through a Server Action call that carries the
 * string unchanged, while submission is a real form post - so without this the
 * submission rejects text the draft accepted, and the message names no field
 * the applicant could go back and shorten.
 *
 * Normalising before the length check also keeps the stored value inside the
 * column the limit is derived from (`specialization_description varchar(500)`).
 */
function multiline<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(/\r\n/g, "\n") : value,
    schema,
  );
}

export const companyDetailsSchema = z.object({
  name: z
    .string()
    .min(2, "Company name must be at least 2 characters")
    .max(255),
  legalName: z.string().max(255).optional(),
  taxId: z.string().max(50).optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: multiline(z.string().max(1000).optional()),
  specializationDescription: multiline(
    z.string().min(2, "Specialization description is required").max(500),
  ),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  // Since the onboarding rework (ADR 0024) the offer and contacts sit with the
  // rest of the business details.
  discount: z.string().max(255).optional(),
  contactEmail: z
    .string()
    .email("Must be a valid email")
    .optional()
    .or(z.literal("")),
  contactPhone: z.string().max(50).optional(),
});

export const companyLocationSchema = z
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
    serviceCountryCodes: z.string().max(2000),
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
    // Each issue carries the field it is about: an error the applicant cannot
    // attribute to a field is an error they cannot act on.
    if (
      value.servesWorldwide === "false" &&
      !value.serviceCountryCodes.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a service country",
        path: ["serviceCountryCodes"],
      });
    }
    if (value.businessFormat !== "online_only") {
      if (!value.city?.trim()) {
        context.addIssue({
          code: "custom",
          message: "City is required",
          path: ["city"],
        });
      }
    }
  });

/**
 * ADR 0024: what the applicant staged under their draft prefix. Both optional
 * - a company without photos is still a company. The ids are checked against
 * staging at submission; a stale one is simply skipped.
 */
export const companyMediaSchema = z.object({
  logoStaged: z.enum(["true", ""]).optional(),
  galleryImageIds: z
    .string()
    .max(400)
    .regex(/^([0-9a-f-]{36}(,[0-9a-f-]{36})*)?$/, "Invalid image list")
    .optional(),
});

/**
 * The message key that labels each field, so a failure can name what to fix
 * (ux.md §3.3). Without it the applicant is told "Invalid input" about a form
 * with eighteen fields, which is not an error message but a riddle.
 */
export const COMPANY_FIELD_LABEL_KEYS: Record<string, string> = {
  name: "nameLabel",
  legalName: "legalNameLabel",
  taxId: "taxIdLabel",
  website: "websiteLabel",
  logoUrl: "logoLabel",
  description: "descriptionLabel",
  specializationDescription: "specializationLabel",
  businessCategoryIds: "subcategoryLabel",
  registrationCountryCode: "registrationCountryLabel",
  serviceCountryCodes: "serviceCountriesLabel",
  servesWorldwide: "worldwideLabel",
  businessFormat: "businessFormatLabel",
  administrativeLevel1: "administrativeLevel1Label",
  administrativeLevel2: "administrativeLevel2Label",
  city: "cityLabel",
  discount: "discountLabel",
  contactEmail: "contactEmailLabel",
  contactPhone: "contactPhoneLabel",
  logoStaged: "logoSectionLabel",
  galleryImageIds: "galleryLabel",
};

/**
 * A failure the form can render in the applicant's own language.
 *
 * Zod's own messages are English and are written for a developer reading a
 * stack trace; every user-facing string in this product exists in three
 * locales (CLAUDE.md). The action therefore reports a code and a field, and
 * the component turns them into prose.
 */
export type CompanyFormIssue = {
  /** Key under `company.errors` in the message catalogue. */
  code: CompanyErrorCode;
  /** Field the applicant must change, absent when the error is not about one. */
  field?: string;
  /** The bound a length or count error is about. */
  limit?: number;
};

export type CompanyErrorCode =
  | "required"
  | "tooShort"
  | "tooLong"
  | "tooFew"
  | "tooMany"
  | "invalidFormat"
  | "invalidChoice"
  | "invalidField"
  | "unauthorized"
  | "categoryUnknown"
  | "categoryProhibited"
  | "cityCountryMismatch"
  | "unexpected";

/**
 * Describe the first thing wrong with a submission.
 *
 * First rather than all: the wizard shows one message above the step, and a
 * list of eighteen would bury the one the applicant is looking at.
 */
export function describeCompanyIssue(error: z.ZodError): CompanyFormIssue {
  const issue = error.issues[0];
  if (!issue) return { code: "invalidField" };

  const field = typeof issue.path[0] === "string" ? issue.path[0] : undefined;

  switch (issue.code) {
    case "invalid_type":
      return { code: "required", field };
    case "too_small":
      return issue.origin === "array"
        ? { code: "tooFew", field, limit: Number(issue.minimum) }
        : { code: "tooShort", field, limit: Number(issue.minimum) };
    case "too_big":
      return issue.origin === "array"
        ? { code: "tooMany", field, limit: Number(issue.maximum) }
        : { code: "tooLong", field, limit: Number(issue.maximum) };
    case "invalid_format":
      return { code: "invalidFormat", field };
    case "invalid_value":
      return { code: "invalidChoice", field };
    case "custom":
      return { code: "required", field };
    default:
      return { code: "invalidField", field };
  }
}

export const registerCompanySchema = companyDetailsSchema
  .extend(companyLocationSchema.shape)
  .extend(companyMediaSchema.shape);

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
