"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentMember } from "@/actions/session";
import { db } from "@/data/db";
import { findCompanyById, setCompanyLogoUrl } from "@/data/companies";
import {
  countImagesByCompany,
  deleteCompanyImageRow,
  findImageWithCompany,
  insertCompanyImage,
} from "@/data/company-images";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import {
  COMPANY_GALLERY_MAX_IMAGES,
  companyLogoServePath,
} from "@/lib/company-image-path";
import {
  InvalidImageError,
  processGalleryImage,
  processLogoImage,
} from "@/lib/image-processing";
import {
  deleteCompanyImage,
  deleteCompanyLogo,
  putCompanyImage,
  putCompanyLogo,
} from "@/modules/platform/company-image-storage";

export type GalleryActionState = { success: boolean; error?: string };

/**
 * Upload one photo into a company's gallery (ADR 0022).
 *
 * Any non-rejected company the caller owns may hold a gallery — same
 * eligibility shape as listing checkout (ADR 0019): what a member may see is
 * gated at read time by approved + paid, not by refusing the owner's writes.
 * The bytes go through the same decode-validate-re-encode pipeline as
 * avatars, bounded to 1600px, EXIF stripped.
 */
export async function uploadCompanyImageAction(
  companyId: string,
  formData: FormData,
): Promise<GalleryActionState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_company");

    z.string().uuid().parse(companyId);
    const company = await findCompanyById(db, companyId);
    if (!company || company.ownerId !== auth.member.id) {
      return { success: false, error: "Not found" };
    }
    if (company.moderationStatus === "rejected") {
      return { success: false, error: "Not found" };
    }

    const existing = await countImagesByCompany(db, companyId);
    if (existing >= COMPANY_GALLERY_MAX_IMAGES) {
      return { success: false, error: "gallery_full" };
    }

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "unreadable" };
    }

    let webp: Buffer;
    try {
      webp = await processGalleryImage(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      const code =
        err instanceof InvalidImageError ? err.code : "processing_failed";
      return { success: false, error: code };
    }

    // Row first, object second: an object whose row insert failed would be
    // orphaned with nothing pointing at it, while a row whose object PUT
    // failed renders as a broken image the owner can simply delete.
    const { id } = await insertCompanyImage(db, companyId);
    try {
      await putCompanyImage(companyId, id, webp);
    } catch (err) {
      await deleteCompanyImageRow(db, id);
      throw err;
    }

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: "Not found" };
    return { success: false, error: "processing_failed" };
  }
}

export async function deleteCompanyImageAction(
  imageId: string,
): Promise<GalleryActionState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_company");

    z.string().uuid().parse(imageId);
    const image = await findImageWithCompany(db, imageId);
    if (!image || image.ownerId !== auth.member.id) {
      return { success: false, error: "Not found" };
    }

    // Row first so the image disappears from every listing immediately; the
    // object delete is best-effort - a failed one leaves unreferenced bytes,
    // not a visible photo.
    await deleteCompanyImageRow(db, imageId);
    try {
      await deleteCompanyImage(image.companyId, imageId);
    } catch (err) {
      console.error(
        `[company-images] object delete failed for image ${imageId}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: "Not found" };
    return { success: false, error: "processing_failed" };
  }
}

/**
 * Upload (or replace) a company's logo (ADR 0023). One slot, overwritten:
 * the same shape as the member avatar, so there is nothing to sweep. The
 * stored `logoUrl` becomes the serve path, which every existing reader of
 * that column renders unchanged.
 */
export async function uploadCompanyLogoAction(
  companyId: string,
  formData: FormData,
): Promise<GalleryActionState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_company");

    z.string().uuid().parse(companyId);
    const company = await findCompanyById(db, companyId);
    if (
      !company ||
      company.ownerId !== auth.member.id ||
      company.moderationStatus === "rejected"
    ) {
      return { success: false, error: "Not found" };
    }

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "unreadable" };
    }

    let webp: Buffer;
    try {
      webp = await processLogoImage(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      const code =
        err instanceof InvalidImageError ? err.code : "processing_failed";
      return { success: false, error: code };
    }

    await putCompanyLogo(companyId, webp);
    await setCompanyLogoUrl(db, companyId, companyLogoServePath(companyId));

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: "Not found" };
    return { success: false, error: "processing_failed" };
  }
}

export async function removeCompanyLogoAction(
  companyId: string,
): Promise<GalleryActionState> {
  try {
    const auth = await getCurrentMember();
    if (!auth?.member) {
      return { success: false, error: "Unauthorized" };
    }

    const actor = buildActor(auth.member);
    assertCan(actor, "update", "own_company");

    z.string().uuid().parse(companyId);
    const company = await findCompanyById(db, companyId);
    if (!company || company.ownerId !== auth.member.id) {
      return { success: false, error: "Not found" };
    }

    // Column first so the placeholder shows immediately; the object delete
    // is best-effort, as with gallery images.
    await setCompanyLogoUrl(db, companyId, null);
    try {
      await deleteCompanyLogo(companyId);
    } catch (err) {
      console.error(
        `[company-images] logo object delete failed for company ${companyId}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError)
      return { success: false, error: "Not found" };
    return { success: false, error: "processing_failed" };
  }
}
