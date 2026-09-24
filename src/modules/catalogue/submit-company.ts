import type { DbClient } from "@/data/db";
import {
  companySlugExists,
  findCategoryById,
  insertCompany,
  setCompanyLogoUrl,
  validateCityBelongsToCountry,
} from "@/data/companies";
import { insertCompanyImageWithId } from "@/data/company-images";
import { deleteCompanyDraft } from "@/data/company-drafts";
import { companyLogoServePath } from "@/lib/company-image-path";
import {
  describeCompanyIssue,
  registerCompanySchema,
  type CompanyFormIssue,
} from "@/lib/company-form";
import { parseDraftImageIds } from "@/lib/draft-media-path";
import { isProhibitedCategory } from "@/lib/prohibited-categories";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import { companySlug } from "@/lib/slug";
export type SubmitCompanyResult = {
  success: boolean;
  issue?: CompanyFormIssue;
  companyId?: string;
};

/**
 * Turn a submitted application into a `pending` company owned by `ownerId`
 * (FR-040, FR-042).
 *
 * The owner is a parameter rather than something read out of the session,
 * because there are two ways to arrive here and only one of them has a session
 * to read. A member submits from the dashboard; a business arriving from the
 * landing page creates its account and its application in the same request
 * (FR-109), and at that instant the session cookie has been written but not
 * yet round-tripped through a browser.
 *
 * **This function does not authorise anything.** It is not a Server Action and
 * must never become one: its caller has already established who the owner is,
 * and an endpoint that took an owner id from the wire would let anybody file an
 * application under anybody's name. Both callers run `assertCan` or create the
 * member themselves first.
 *
 * The database client is a parameter for the reason every other module here
 * takes one: it is what makes the rules above testable against a real
 * PostgreSQL without a Next request around them.
 */
export async function submitCompany(
  db: DbClient,
  ownerId: string,
  formData: FormData,
): Promise<SubmitCompanyResult> {
  try {
    const parsed = registerCompanySchema.safeParse(
      Object.fromEntries(formData.entries()),
    );

    if (!parsed.success) {
      return { success: false, issue: describeCompanyIssue(parsed.error) };
    }

    for (const catId of parsed.data.businessCategoryIds) {
      const category = await findCategoryById(db, catId);
      if (!category) {
        return {
          success: false,
          issue: { code: "categoryUnknown", field: "businessCategoryIds" },
        };
      }
      if (isProhibitedCategory(category)) {
        return {
          success: false,
          issue: { code: "categoryProhibited", field: "businessCategoryIds" },
        };
      }
    }

    const cityValid = await validateCityBelongsToCountry(
      db,
      parsed.data.city ?? "",
      parsed.data.registrationCountryCode,
    );
    if (!cityValid) {
      return {
        success: false,
        issue: { code: "cityCountryMismatch", field: "city" },
      };
    }

    const baseSlug = companySlug(parsed.data.name);
    let finalSlug = baseSlug;

    let isUnique = false;
    let counter = 1;
    while (!isUnique) {
      const exists = await companySlugExists(db, finalSlug);
      if (!exists) {
        isUnique = true;
      } else {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    const companyId = await insertCompany(
      db,
      {
        ownerId,
        name: parsed.data.name,
        slug: finalSlug,
        legalName: parsed.data.legalName,
        taxId: parsed.data.taxId,
        website: parsed.data.website,
        description: parsed.data.description,
        businessCategoryId: parsed.data.businessCategoryIds[0] ?? null,
        discount: parsed.data.discount,
        logoUrl: null,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        country: parsed.data.registrationCountryCode,
        city: parsed.data.city || null,
        registrationCountryCode: parsed.data.registrationCountryCode,
        businessFormat: parsed.data.businessFormat,
        administrativeLevel1: parsed.data.administrativeLevel1 || null,
        administrativeLevel2: parsed.data.administrativeLevel2 || null,
        specializationDescription: parsed.data.specializationDescription,
        servesWorldwide: parsed.data.servesWorldwide === "true" ? 1 : 0,
        moderationStatus: "pending",
      },
      parsed.data.serviceCountryCodes.split(",").filter(Boolean),
      parsed.data.businessCategoryIds,
    );

    // ADR 0024: media staged during onboarding becomes the company's. Best
    // effort - the application is the point, a lost photo is not. Rows are
    // written only for objects the copy confirmed, and the staging prefix is
    // deleted only after those rows exist.
    //
    // Skipped entirely, and imported only here, when the applicant staged
    // nothing: their prefix is empty by construction, and the object store is
    // the one dependency in this module that needs credentials to load at all.
    const stagedLogo = parsed.data.logoStaged === "true";
    const stagedImages = parseDraftImageIds(parsed.data.galleryImageIds);

    if (stagedLogo || stagedImages.length > 0) {
      try {
        const { deleteDraftMedia, promoteDraftMedia } =
          await import("@/modules/platform/draft-media-storage");

        const promoted = await promoteDraftMedia(ownerId, companyId, {
          logo: stagedLogo,
          imageIds: stagedImages,
        });
        for (const imageId of promoted.imageIds) {
          await insertCompanyImageWithId(db, companyId, imageId);
        }
        if (promoted.logo) {
          await setCompanyLogoUrl(
            db,
            companyId,
            companyLogoServePath(companyId),
          );
        }
        await deleteDraftMedia(ownerId);
      } catch (error) {
        logger.error("Draft media promotion failed", safeErrorFields(error));
      }
    }

    // The application is now a company; the draft has served its purpose.

    await deleteCompanyDraft(db, ownerId);

    return { success: true, companyId };
  } catch (error) {
    logger.error("Company registration failed", safeErrorFields(error));
    return { success: false, issue: { code: "unexpected" } };
  }
}
