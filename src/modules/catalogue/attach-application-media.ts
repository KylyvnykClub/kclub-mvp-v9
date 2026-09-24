import type { DbClient } from "@/data/db";
import { setCompanyLogoUrl } from "@/data/companies";
import {
  insertCompanyImage,
  deleteCompanyImageRow,
} from "@/data/company-images";
import {
  COMPANY_GALLERY_MAX_IMAGES,
  companyLogoServePath,
} from "@/lib/company-image-path";
import { processGalleryImage, processLogoImage } from "@/lib/image-processing";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import {
  putCompanyImage,
  putCompanyLogo,
} from "@/modules/platform/company-image-storage";

/**
 * Attach the logo and photos a public applicant picked, in the same request
 * that created their company (FR-109, ADR 0022, ADR 0023).
 *
 * The dashboard form stages media under the applicant's draft prefix before
 * submitting (ADR 0024). A business arriving from the landing page has no
 * account to stage under, so its files ride along in the same FormData and are
 * processed here, immediately after `submitCompany` has made the company real.
 *
 * **Server-side on purpose.** The first version uploaded them from the browser
 * after the action returned, and a walk through the real funnel showed why that
 * is wrong: the action's response re-renders the page, the page sends a partner
 * who now has an application to their standing screen, and the uploads were
 * left racing a navigation. Here they are simply part of the submit.
 *
 * Best effort, like the draft promotion it mirrors: the application is the
 * point, and a photo that will not decode must not turn a filed application
 * into a failure. Each failure is logged and skipped.
 */
export async function attachApplicationMedia(
  db: DbClient,
  companyId: string,
  formData: FormData,
): Promise<void> {
  const logo = formData.get("logoFile");
  if (logo instanceof File && logo.size > 0) {
    try {
      const webp = await processLogoImage(
        Buffer.from(await logo.arrayBuffer()),
      );
      await putCompanyLogo(companyId, webp);
      await setCompanyLogoUrl(db, companyId, companyLogoServePath(companyId));
    } catch (error) {
      logger.error("Application logo could not be attached", {
        companyId,
        ...safeErrorFields(error),
      });
    }
  }

  const images = formData
    .getAll("galleryFile")
    .filter((file): file is File => file instanceof File && file.size > 0)
    .slice(0, COMPANY_GALLERY_MAX_IMAGES);

  for (const image of images) {
    try {
      const webp = await processGalleryImage(
        Buffer.from(await image.arrayBuffer()),
      );
      // Row first, object second, exactly as the gallery action does it: an
      // object whose row insert failed is orphaned with nothing pointing at
      // it, while a row whose PUT failed is a broken image the owner can
      // delete.
      const { id } = await insertCompanyImage(db, companyId);
      try {
        await putCompanyImage(companyId, id, webp);
      } catch (error) {
        await deleteCompanyImageRow(db, id);
        throw error;
      }
    } catch (error) {
      logger.error("Application photo could not be attached", {
        companyId,
        ...safeErrorFields(error),
      });
    }
  }
}
